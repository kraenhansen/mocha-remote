import Mocha from "mocha";
import WebSocket, { WebSocketServer, AddressInfo } from "ws";
import path from "path";
import type http from "http";
import flatted from "flatted";

import type { ClientMessage, CustomContext, ServerMessage, MochaConfig } from "mocha-remote-common";
export type { CustomContext };

import { createStatsCollector } from "./stats-collector";
import { extend, Debugger } from "./debug";

import { FakeRunner } from "./FakeRunner";
import { ServerEventEmitter } from "./ServerEventEmitter";
import { deserialize } from "./serialization";

type MochaReporters = { [name: string]: typeof Mocha.reporters.Base };
const builtinReporters: MochaReporters = Mocha.reporters;

export type ReporterOptions = { [key: string]: string | boolean };

function createPromiseHandle() {
  let resolve: () => void = () => {
    throw new Error(
      "Expected new Promise callback to be called synchronously"
    );
  };
  const promise = new Promise<void>(r => (resolve = r));
  return { promise, resolve };
}

/**
 * An error thrown by a connected client
 */
export class ClientError extends Error {
  public readonly ws: WebSocket;

  constructor(message: string, ws: WebSocket) {
    super(message);
    this.ws = ws;
  }
}

export interface ServerConfig {
  /** Network hostname to use when listening for clients */
  host: string;
  /** Network port to use when listening for clients */
  port: number;
  /** Start the server as soon as it gets constructed */
  autoStart: boolean;
  /** Start running tests as soon as a client connects */
  autoRun: boolean;
  /** An ID expected by the clients connecting */
  id: string;
  /** Specify reporter to use */
  reporter: Mocha.ReporterConstructor | string;
  /** Reporter-specific options */
  reporterOptions: ReporterOptions;
  /** ReporterOptions was previously the only way to specify options to reporter  */
  reporterOption?: ReporterOptions;
  /** Only run tests matching this string or regexp */
  grep: string | undefined;
  /** Inverts grep matches */
  invert: boolean | undefined;
  /** Tests needs to complete before this timeout threshold (in milliseconds) */
  timeout: number | undefined;
  /** Specifies "slow" test threshold (in milliseconds) */
  slow: number | undefined;
  /** Runtime context sent to client when starting a run */
  context: CustomContext | undefined;
}

export class Server extends ServerEventEmitter {
  public static DEFAULT_CONFIG: ServerConfig = {
    autoStart: false,
    host: "localhost",
    id: "default",
    port: 8090,
    autoRun: false,
    reporter: "spec",
    reporterOptions: {},
    grep: undefined,
    invert: undefined,
    context: undefined,
    timeout: undefined,
    slow: undefined,
  };

  private static debugCounter = 0;
  private static nextDebug() {
    return extend(`Server[${Server.debugCounter++}]`);
  }

  public readonly stopped: Promise<void>;
  public readonly config: ServerConfig;

  private readonly debug: Debugger;
  private wss?: WebSocketServer;
  private client?: WebSocket;
  private runner?: FakeRunner;
  private stoppedPromiseHandle = createPromiseHandle();
  /** The options to send to the next connecting running client */
  private clientOptions?: MochaConfig = {};
  private _listening = false;

  constructor(
    config: Partial<ServerConfig> = {},
    debug = Server.nextDebug(),
  ) {
    super(debug.extend("events"));
    this.debug = debug;
    this.debug("Constructing a server");
    this.config = { ...Server.DEFAULT_CONFIG, ...config };
    this.stopped = this.stoppedPromiseHandle.promise;
  }

  public async start(): Promise<void> {
    this.debug(`Server is starting`);
    await new Promise<void>((resolve, reject) => {
      this.wss = new WebSocketServer({
        host: this.config.host,
        port: this.config.port
      });
      // When a client connects
      this.wss.on("connection", this.handleConnection);
      // When the server starts listening
      this.wss.once("listening", () => {
        this.debug(`Server is listening on ${this.url}`);
        resolve();
      });
      // If an error happens while starting
      this.wss.once("error", (err: Error) => {
        this.debug(`Server failed to start ${err.stack}`);
        this.emit("error", err);
        reject(err);
      });
    });
    this._listening = true;
    this.emit("started", this);
  }

  public async stop(code = 1000, reason = "Server stopping"): Promise<void> {
    this.debug("Server is stopping");
    await new Promise<void>((resolve, reject) => {
      if (this.wss) {
        // Close any client connections, giving a code and reason
        for (const ws of this.wss.clients) {
          ws.close(code, reason);
        }
        // Close the server
        this.wss.close(err => {
          this.handleReset();
          // Forget about the server
          delete this.wss;
          // Reject or resolve the promise
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
        // Terminate any clients still connected, allowing the server to close
        for (const ws of this.wss.clients) {
          ws.terminate();
        }
      } else {
        resolve();
      }
    });
    this.debug("Server was stopped");
    // Resolve the stopped promise
    this._listening = false;
    this.stoppedPromiseHandle.resolve();
  }

  public get listening() {
    return this._listening;
  }

  public run(fn: (failures: number) => void, context?: CustomContext): Mocha.Runner {
    this.debug("Server started running tests");

    if (!this.wss) {
      if (this.config.autoStart) {
        this.start().then(undefined, err => {
          this.debug(`Auto-starting failed: ${err.stack}`);
        });
      } else {
        throw new Error("Server must be started before run is called");
      }
    }

    if (this.runner) {
      throw new Error("A run is already in progress");
    }
    // this.runner = new Mocha.Runner(this.suite, this.options.delay || false);
    // TODO: Stub this to match the Runner's interface even better
    this.runner = new FakeRunner();
    // Attach event listeners to update stats
    createStatsCollector(this.runner as Mocha.Runner);

    // Set the client options, to be passed to the next running client
    this.clientOptions = {
      grep: this.config.grep,
      invert: this.config.invert,
      timeout: this.config.timeout,
      slow: this.config.slow,
      context: {
        ...this.config.context,
        ...context,
      },
    };

    this.debug(this.clientOptions);

    // We need to access the private _reporter field
    const Reporter = this.determineReporterConstructor(this.config.reporter);
    // When constructing the Reporter we need to (unintuitively) pass all options, not the `options.reporterOptions`
    const reporter = new Reporter(this.runner as Mocha.Runner, {
      // alias option name is used in public reporters xunit/tap/progress
      // https://github.com/mochajs/mocha/issues/4153
      reporterOptions: this.config.reporterOptions ?? this.config.reporterOption,
      reporterOption: this.config.reporterOption ?? this.config.reporterOptions,
    } as { reporterOptions: ReporterOptions, reporterOption: ReporterOptions });

    const done = (failures: number) => {
      this.debug("Testing is done");
      // If the reporter wants to know when we're done, we will tell it
      // It will call the fn callback for us
      if (reporter.done) {
        reporter.done(failures, fn);
      } else if (fn) {
        fn(failures);
      }
    };

    // Attach a listener to the run ending
    this.runner.once(FakeRunner.constants.EVENT_RUN_END, () => {
      const failures = this.runner ? this.runner.failures : 0;
      // Call any callbacks to signal completion
      done(failures);
      this.handleReset();
    });

    // If we already have a client, tell it to run
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      this.send({
        action: "run",
        options: this.clientOptions,
      });
    }

    // Return the runner
    return this.runner as Mocha.Runner;
  }

  public async runAndStop(context?: CustomContext): Promise<void> {
    let handleError: undefined | ((err: Error) => void) = undefined;
    try {
      // Run the tests
      // TODO: Consider adding a timeout
      const failures = await new Promise<number>((resolve, reject) => {
        // Register an error handler and keep a reference to remove it later
        handleError = reject;
        this.on("error", handleError);
        this.run(resolve, context);
      });
      if (failures > 0) {
        throw new Error(`Tests completed with ${failures} failures`);
      }
    } finally {
      // Stop handling errors
      if (handleError) {
        this.off("error", handleError);
      }
      // Stop the server
      await this.stop();
    }
  }

  public get port(): number {
    if (this.wss) {
      const { port } = this.wss.address() as AddressInfo;
      return port;
    } else {
      throw new Error("Cannot get port of a server that is not listening");
    }
  }

  public get url(): string {
    if (this.wss) {
      const { address, port, family } = this.wss.address() as AddressInfo;
      if (family === "IPv6") {
        return `ws://[${address}]:${port}`;
      } else {
        return `ws://${address}:${port}`;
      }
    } else {
      throw new Error("Cannot get url of a server that is not listening");
    }
  }

  public send(msg: ClientMessage): void {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      const data = flatted.stringify(msg);
      this.client.send(data);
    } else {
      throw new Error("No client connected");
    }
  }

  private handleConnection = (ws: WebSocket, req: http.IncomingMessage) => {
    this.debug("Client connected");
    // Check that the protocol matches
    const expectedProtocol = `mocha-remote-${this.config.id}`;
    ws.on("close", (code, reason) => {
      this.emit("disconnection", ws, code, reason.toString());
    });
    // Signal that a client has connected
    this.emit("connection", ws, req);
    // Disconnect if the protocol mismatch
    if (ws.protocol !== expectedProtocol) {
      // Protocol mismatch - close the connection
      ws.close(
        1002,
        `Expected "${expectedProtocol}" protocol got "${ws.protocol}"`
      );
      return;
    }
    if (this.client) {
      this.debug("A client was already connected");
      this.client.close(
        1013 /* try again later */,
        "Got a connection from another client"
      );
      // Reset the server to prepare for the incoming client
      this.handleReset();
    }
    // Hang onto the client
    this.client = ws;
    this.client.on("message", this.handleMessage.bind(this, this.client));
    this.client.once("close", this.handleReset);
    // If we already have a runner, it can run now that we have a client
    if (this.runner) {
      if (this.clientOptions) {
        this.send({ action: "run", options: this.clientOptions });
      } else {
        throw new Error("Internal error: Expected a clientOptions");
      }
    } else if (this.config.autoRun) {
      this.debug("Start running tests because a client connected");
      this.run(() => {
        this.debug("Stopped running tests from connection");
      });
    }
  };

  private handleMessage = (ws: WebSocket, message: string) => {
    try {
      const msg = deserialize(message) as ServerMessage;
      if (typeof msg.action !== "string") {
        throw new Error("Expected message to have an action property");
      }

      this.debug(`Received a '${msg.action}' message: %o`, msg);
      if (msg.action === "event") {
        if (this.runner) {
          const args = msg.args || [];
          this.runner.emit(msg.name, ...args);
        } else {
          throw new Error(
            "Received a message from the client, but server wasn't running"
          );
        }
      } else if (msg.action === "error") {
        if (typeof msg.message !== "string") {
          throw new Error("Expected 'error' action to have an error argument with a message");
        }
        const err = new ClientError(msg.message, ws);
        this.emit("error", err);
      } else {
        const { action } = msg;
        throw new Error(`Unexpected action "${action}"`);
      }
    } catch (err) {
      if (err instanceof Error) {
        this.emit("error", err);
        this.send({ action: "error", message: err.message });
      } else {
        throw err;
      }
    }
  };

  /**
   * Resets the server for another test run.
   */
  private handleReset = () => {
    // Forget everything about the runner and the client
    const { runner, client } = this;
    delete this.runner;
    delete this.client;
    delete this.clientOptions;
    if (runner) {
      runner.removeAllListeners();
      // Relay this onto the server itself
      this.emit("end");
    }
    if (client) {
      if (client.readyState !== WebSocket.CLOSED) {
        client.terminate();
      }
      client.removeAllListeners();
    }
  };

  /**
   * @param reporter A constructor or a string containing the name of a builtin reporter or the module name or relative path of one.
   * @returns A constructor for the reporter.
   * @see {Mocha.prototype.reporter}
   */
  private determineReporterConstructor(reporter: string | Mocha.ReporterConstructor): typeof Mocha.reporters.Base {
    if (typeof reporter === "function") {
      return reporter as unknown as typeof Mocha.reporters.Base;
    } else if (typeof reporter === "string") {
      // Try to load a built-in reporter
      if (reporter in builtinReporters) {
        return builtinReporters[reporter];
      }
      // Try to load reporters from process.cwd() and node_modules
      try {
        try {
          return require(reporter);
        } catch (err) {
          if (err instanceof Error) {
            const { code } = err as NodeJS.ErrnoException;
            if (code === 'MODULE_NOT_FOUND') {
              // If the absolute require couldn't find the module, let's try resolving it as a relative path
              return require(path.resolve(reporter));
            }
          }
          // Fallback to rethrow
          throw err;
        }
      } catch (err) {
        if (err instanceof Error) {
          const { code, stack } = err as NodeJS.ErrnoException;
          if (code === 'MODULE_NOT_FOUND') {
            throw new Error(`Unable to find reporter: '${reporter}'`);
          } else {
            throw new Error(`${reporter} reporter blew up with error: ${stack}`);
          }
        }
        // Fallback to rethrow
        throw err;
      }
    } else {
      throw new Error(`Unexpected reporter '${reporter}'`);
    }
  }
}
