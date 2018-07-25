import * as Debug from "debug";
import * as EventEmitter from "events";
import { parse } from "flatted";
import * as Mocha from "mocha";
import * as WebSocket from "ws";

interface IEventMessage {
  eventName: string;
  args: any[];
}

const debug = Debug("mocha-remote:server");

export interface ICallbacks {
  /** Called when the server is waiting for a client to connect */
  waitingForClient?: () => void;
  /** Client connected */
  clientConnection?: (client: WebSocket) => void;
  /** Called when the server has started */
  serverStarted?: (server: MochaRemoteServer) => void;
  /** Called when the server experience an error */
  serverFailed?: (server: MochaRemoteServer, err: Error) => void;
}

export interface IMochaRemoteServerConfig {
  autoStart: boolean;
  callbacks: Partial<ICallbacks>;
  host: string;
  port: number;
  stopAfterCompletion: boolean;
}

export class MochaRemoteServer extends Mocha {

  public static DEFAULT_CONFIG: IMochaRemoteServerConfig = {
    autoStart: true,
    callbacks: {},
    host: "127.0.0.1",
    port: 8090,
    stopAfterCompletion: false,
  };

  private config: IMochaRemoteServerConfig;
  private wss?: WebSocket.Server;
  private client?: WebSocket;
  private runner?: Mocha.Runner;

  constructor(
    mochaOptions: Mocha.MochaOptions = {},
    config: Partial<IMochaRemoteServerConfig> = {},
  ) {
    super(mochaOptions);
    this.config = { ...MochaRemoteServer.DEFAULT_CONFIG, ...config };
  }

  public start() {
    debug(`Server is starting`);
    return new Promise<void>((resolve, reject) => {
      this.wss = new WebSocket.Server({
        host: this.config.host,
        port: this.config.port,
      });
      // When the server starts listening
      this.wss.once("listening", () => {
        debug(`Server is listening on ${this.getUrl()}`);
        resolve();
      });
      this.wss.once("error", (err: Error) => {
        debug(`Server failed to start ${err.stack}`);
        if (this.config.callbacks.serverFailed) {
          this.config.callbacks.serverFailed(this, err);
        }
        reject(err);
      });
      // When a client connects
      this.wss.on("connection", (ws) => {
        debug("Client connected");
        if (this.client) {
          debug("A client was already connected");
          this.client.removeAllListeners();
        }
        // Hang onto the client
        this.client = ws;
        this.client.on("message", this.onMessage);
        // Signal that a client has connected
        if (this.config.callbacks.clientConnection) {
          this.config.callbacks.clientConnection(this.client);
        }
        // If we already have a runner, it can run now that we have a client
        if (this.runner) {
          this.send("run");
        }
      });
    }).then(() => {
      if (this.config.callbacks.serverStarted) {
        this.config.callbacks.serverStarted(this);
      }
    });
  }

  public stop() {
    debug("Server is stopping");
    return new Promise((resolve, reject) => {
      if (this.wss) {
        this.wss.close((err) => {
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
    });
  }

  public run(fn?: (failures: number) => void) {
    debug("Server started running tests");

    if (!this.wss) {
      if (this.config.autoStart) {
        this.start().then(undefined, (err) => {
          debug(`Auto-starting failed: ${err.stack}`);
        });
      } else {
        throw new Error("Server must be started before run is called");
      }
    }

    if (this.runner) {
      throw new Error("A run is already in progress");
    }
    // this.runner = new Mocha.Runner(this.suite, this.options.delay || false);
    // TODO: Stub this to match the Runner's interface
    this.runner = new EventEmitter() as Mocha.Runner;

    // We need to access the private _reporter field
    const Reporter = (this as any)._reporter;
    const reporter = new Reporter(this.runner, this.options.reporterOptions);

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
      const failures = this.runner && this.runner.stats && this.runner.stats.failures || 0;
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
      this.send("run");
    } else if (this.config.callbacks.waitingForClient) {
      this.config.callbacks.waitingForClient();
    }

    // Return the runner
    return this.runner;
  }

  public getUrl() {
    if (this.wss) {
      const { address, port } = this.wss.address() as WebSocket.AddressInfo;
      return `ws://${address}:${port}`;
    } else {
      throw new Error("Cannot get url of a server that is not listening");
    }
  }

  public send(eventName: string, ...args: any[]) {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      const data = JSON.stringify({ eventName, args });
      this.client.send(data);
    } else {
      throw new Error("No client connected");
    }
  }

  private onMessage = (message: string) => {
    const { eventName, args } = parse(message) as IEventMessage;
    debug(`Received a '${eventName}' message`);
    if (this.runner) {
      const inflatedArgs = this.inflateMochaArgs(eventName, args);
      this.runner.emit(eventName, ...inflatedArgs);
    } else {
      throw new Error("Received a message from the client, but server wasn't running");
    }
  }

  private inflateMochaArgs(eventName: string, args: any[]) {
    // Monkey patch the test object when it passes
    if (["test", "test end", "pass", "fail", "pending", "suite", "suite end"].indexOf(eventName) >= 0) {
        // Create an actual test object to allow calls to methods
        args[0] = this.inflateRunnable(args[0]);
    }
    return args;
  }

  private inflateRunnable(data: { [k: string]: any }) {
      const title: string = data.hasOwnProperty("title") ? data.title : "";
      // Create an actual test object to allow calls to methods
      const runnable = data.type === "test" ? new Mocha.Test(title) : new Mocha.Suite(title);
      // Patch the data onto the test
      Object.assign(runnable, data);
      // If it has a parent - inflate that too
      if (runnable.parent) {
          runnable.parent = this.inflateRunnable(runnable.parent) as Mocha.Suite;
      }
      return runnable;
  }
}
