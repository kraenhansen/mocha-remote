import Debug from "debug";
import { parse } from "flatted";
import Mocha from "mocha";
import WebSocket from "ws";
import path from "path";
import type http from "http";

import type { ClientMessage } from "../../../types/client";
import type { ServerMessage } from "../../../types/server";

import { FakeRunner } from "./FakeRunner";
import { ServerEventEmitter } from "./ServerEventEmitter";

type MochaReporters = { [name: string]: typeof Mocha.reporters.Base };
const builtinReporters: MochaReporters = Mocha.reporters;

export type ReporterOptions = { [key: string]: string | boolean };

const debug = Debug("mocha-remote:server");

function createPromiseHandle() {
  let resolve: () => void = () => {
    throw new Error(
      "Expected new Promise callback to be called synchronisously"
    );
  };
  const promise = new Promise<void>(r => (resolve = r));
  return { promise, resolve };
}

export interface ServerConfig {
  autoStart: boolean;
  host: string;
  port: number;
  stopAfterCompletion: boolean;
  runOnConnection: boolean;
  /** An ID expected by the clients connecting */
  id: string;
  reporter: Mocha.ReporterConstructor | string;
  reporterOptions: ReporterOptions;
  grep: string | undefined;
}

export class Server extends ServerEventEmitter {
  public static DEFAULT_CONFIG: ServerConfig = {
    autoStart: true,
    host: "0.0.0.0",
    id: "default",
    port: 8090,
    stopAfterCompletion: false,
    runOnConnection: false,
    reporter: "spec",
    reporterOptions: {},
    grep: undefined,
  };

  public readonly stopped: Promise<void>;

  private config: ServerConfig;
  private wss?: WebSocket.Server;
  private client?: WebSocket;
  private runner?: FakeRunner;
  private stoppedPromiseHandle = createPromiseHandle();

  constructor(
    config: Partial<ServerConfig> = {}
  ) {
    super();
    this.config = { ...Server.DEFAULT_CONFIG, ...config };
    this.stopped = this.stoppedPromiseHandle.promise;
  }

  public start(): Promise<void> {
    debug(`Server is starting`);
    return new Promise<void>((resolve, reject) => {
      this.wss = new WebSocket.Server({
        host: this.config.host,
        port: this.config.port
      });
      // When a client connects
      this.wss.on("connection", this.onConnection);
      // When the server starts listening
      this.wss.once("listening", () => {
        debug(`Server is listening on ${this.getUrl()}`);
        resolve();
      });
      // If an error happens while starting
      this.wss.once("error", (err: Error) => {
        debug(`Server failed to start ${err.stack}`);
        this.emit("error", err);
        reject(err);
      });
    }).then(() => {
      this.emit("started", this);
    });
  }

  public stop(): Promise<void> {
    debug("Server is stopping");
    return new Promise<void>((resolve, reject) => {
      if (this.wss) {
        this.wss.close(err => {
          // Forget about the server
          delete this.wss;
          // Reject or resolve the promise
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    }).then(() => {
      debug("Server was stopped");
      // Resolve the stopped promise
      this.stoppedPromiseHandle.resolve();
    });
  }

  public run(fn: (failures: number) => void): Mocha.Runner {
    debug("Server started running tests");

    if (!this.wss) {
      if (this.config.autoStart) {
        this.start().then(undefined, err => {
          debug(`Auto-starting failed: ${err.stack}`);
        });
      } else {
        throw new Error("Server must be started before run is called");
      }
    }

    if (this.runner) {
      throw new Error("A run is already in progress");
    }
    // this.runner = new Mocha.Runner(this.suite, this.options.delay || false);
    // TODO: Stub this to match the Runner's interface
    this.runner = new FakeRunner();

    // We need to access the private _reporter field
    const Reporter = this.determineReporterConstructor(this.config.reporter);
    // When constructing the Reporter we need to (unintuitively) pass all options, not the `options.reporterOptions`
    const reporter = new Reporter(this.runner as Mocha.Runner, {
      // alias option name is used in public reporters xunit/tap/progress
      reporterOptions: this.config.reporterOptions,
    });

    const done = (failures: number) => {
      debug("Server ended testing");
      // If the reporter wants to know when we're done, we will tell it
      // It will call the fn callback for us
      if (reporter.done) {
        reporter.done(failures, fn);
      } else if (fn) {
        try {
          fn(failures);
        } catch (err) {
          throw new Error(err);
        }
      }
    };

    // Attach a listener to the run ending
    this.runner.once("end", () => {
      const failures =
        (this.runner && this.runner.stats && this.runner.stats.failures) || 0;
      // Delete the runner to allow another run
      delete this.runner;
      // Stop the server if we should
      if (this.config.stopAfterCompletion) {
        this.stop();
      }
      // Call any callbacks to signal completion
      done(failures);
    });

    // If we already have a client, tell it to run
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      // TODO: Send runtime options to the client
      this.send({
        action: "run",
        options: {
          ...this.clientOptions,
        },
      });
    }

    // Return the runner
    return this.runner as Mocha.Runner;
  }

  public async runAndStop(): Promise<void> {
    try {
      // Run the tests
      // TODO: Consider adding a timeout
      const failures = await new Promise<number>(resolve => this.run(resolve));
      if (failures > 0) {
        throw new Error(`Tests completed with ${failures} failures`);
      }
    } finally {
      // Stop the server
      await this.stop();
    }
  }

  public getUrl(): string {
    if (this.wss) {
      const { address, port } = this.wss.address() as WebSocket.AddressInfo;
      return `ws://${address}:${port}`;
    } else {
      throw new Error("Cannot get url of a server that is not listening");
    }
  }

  public send(msg: ClientMessage): void {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(msg);
      this.client.send(data);
    } else {
      throw new Error("No client connected");
    }
  }

  private onConnection = (ws: WebSocket, req: http.IncomingMessage) => {
    debug("Client connected");
    // Check that the protocol matches
    const expectedProtocol = `mocha-remote-${this.config.id}`;
    if (ws.protocol !== expectedProtocol) {
      // Protocol mismatch - close the connection
      ws.close(
        1002,
        `Expected "${expectedProtocol}" protocol got "${ws.protocol}"`
      );
      return;
    }
    if (this.client) {
      debug("A client was already connected");
      this.client.removeAllListeners();
      this.client.close(
        1013 /* try again later */,
        "Got a connection from another client"
      );
      delete this.client;
    }
    // Hang onto the client
    this.client = ws;
    this.client.on("message", this.onMessage.bind(this, this.client));
    this.client.on("close", (code: number, reason: string) => {
      this.emit("disconnection", ws, code, reason);
    });
    // Signal that a client has connected
    this.emit("connection", ws, req);
    // If we already have a runner, it can run now that we have a client
    if (this.runner) {
      this.send({ action: "run", options: this.clientOptions });
    } else if (this.config.runOnConnection) {
      debug("Start running tests because a client connected");
      this.run(() => {
        debug("Stopped running tests from connection");
      });
    }
  };

  private onMessage = (ws: WebSocket, message: string) => {
    try {
      const msg = JSON.parse(message) as ServerMessage;
      if (typeof msg.action !== "string") {
        throw new Error("Expected message to have an action property");
      }
      
      debug(`Received a '${msg.action}' message`);
      if (msg.action === "event") {
        if (this.runner) {
          /*
          const inflatedArgs = this.inflateMochaArgs(msg.name, msg.args);
          this.runner.emit(msg.action, ...inflatedArgs);
          */
          throw new Error(`Not yet implemented`);
        } else {
          throw new Error(
            "Received a message from the client, but server wasn't running"
          );
        }
      } else if (msg.action === "error") {
        if (typeof msg.message !== "string") {
          throw new Error("Expected 'error' action to have an error argument with a message");
        }
        // TODO: Emit an error event
      } else {
        const { action } = msg;
        throw new Error(`Unexpected action "${action}"`);
      }
    } catch (err) {
      this.emit("error", err);
      this.send({ action: "error", message: err.message });
    }
  };

  /**
   * @param reporter A constructor or a string containing the name of a builtin reporter or the module name or relative path of one.
   * @returns A constructor for the reporter.
   * @see {Mocha.prototype.reporter}
   */
  private determineReporterConstructor(reporter: string | Mocha.ReporterConstructor) {
    if (typeof reporter === "function") {
      return reporter;
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
          if (err.code === 'MODULE_NOT_FOUND') {
            // If the absolute require couldn't find the module, let's try resolving it as a relative path
            return require(path.resolve(reporter));
          }
          // Rethrow
          throw err;
        }
      } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
          throw new Error(`Unable to find reporter: '${reporter}'`);
        } else {
          throw new Error(`${reporter} reporter blew up with error: ${err.stack}`);
        }
      }
    } else {
      throw new Error(`Unexpected reporter '${reporter}'`);
    }
  }

  private get clientOptions() {
    const { grep } = this.config;
    return { grep };
  }

  private inflateMochaArgs(eventName: string, args: unknown[]) {
    // Monkey patch the test object when it passes
    if (
      [
        "test",
        "test end",
        "pass",
        "fail",
        "pending",
        "suite",
        "suite end"
      ].indexOf(eventName) >= 0
    ) {
      // Create an actual test object to allow method calls
      args[0] = this.inflateRunnable(args[0]);
    }
    return args;
  }

  private inflateRunnable(data: unknown) {
    if (typeof data !== "object" || data === null) {
      throw new Error("Expected an object");
    }
    const { title = "", type = "" } = data as { title?: string, type?: string };
    // Create an actual test object to allow calls to methods
    const runnable =
      type === "test" ? new Mocha.Test(title) : new Mocha.Suite(title);
    // Patch the data onto the test
    Object.assign(runnable, data);
    // If it has a parent - inflate that too
    if (runnable.parent) {
      runnable.parent = this.inflateRunnable(runnable.parent) as Mocha.Suite;
    }
    return runnable;
  }
}
