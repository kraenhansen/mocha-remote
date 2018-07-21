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

export interface IMochaRemoteServerConfig {
  host: string;
  port: number;
  mochaOptions?: Mocha.MochaOptions;
  suite?: Mocha.Suite;
}

const DEFAULT_CONFIG: IMochaRemoteServerConfig = {
  host: "127.0.0.1",
  port: 9080,
};

export class MochaRemoteServer extends Mocha {
  private config: IMochaRemoteServerConfig;
  private wss?: WebSocket.Server;
  private client?: WebSocket;
  private runner?: Mocha.Runner;

  constructor(config: Partial<IMochaRemoteServerConfig> = {}) {
    super(config.mochaOptions);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public start() {
    debug(`Server is starting`);
    return new Promise<void>((resolve) => {
      this.wss = new WebSocket.Server({
        host: this.config.host,
        port: this.config.port,
      });
      // When the server starts listening
      this.wss.once("listening", () => {
        debug(`Server is listening on ${this.getUrl()}`);
        resolve();
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
        // If we already have a runner, it can run now that we have a client
        if (this.runner) {
          this.send("run");
        }
      });
    });
  }

  public stop() {
    debug("Server is stopping");
    return new Promise((resolve, reject) => {
      if (this.wss) {
        this.wss.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        const err = new Error("The server is not running");
        reject(err);
      }
    }).then(() => {
      debug("Server was stopped");
    });
  }

  public run(fn?: (failures: number) => void) {
    if (this.runner) {
      throw new Error("A run is already in progress");
    }
    // this.runner = new Mocha.Runner(this.suite, this.options.delay || false);
    this.runner = new EventEmitter() as Mocha.Runner;
    // If we already have a client, tell it to run
    if (this.client) {
      // TODO: Send runtime options to the client
      this.send("run");
    }

    // We need to access the private _reporter field
    const Reporter = (this as any)._reporter;
    const reporter = new Reporter(this.runner, this.options.reporterOptions);

    function done(failures: number) {
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
    }

    // Attach a listener to the run ending
    this.runner.once("end", () => {
      const failures = this.runner && this.runner.stats && this.runner.stats.failures || 0;
      done(failures);
    });

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
