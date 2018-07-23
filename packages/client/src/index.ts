import * as Debug from "debug";
import { stringify } from "flatted";
import * as WebSocket from "isomorphic-ws";
import * as Mocha from "mocha";

interface IEventMessage {
  eventName: string;
  args: any[];
}

interface IInstrumentedMocha extends Mocha {
  originalRun: (fn?: (failures: number) => void) => Mocha.Runner;
}

export type RunCallback = (runner: Mocha.Runner) => void;

const debug = Debug("mocha-remote:client");

export interface IMochaRemoteClientConfig {
  autoConnect: boolean;
  /** Fail silently and perform automatic retrying when connecting to the server */
  autoRetry: boolean;
  /** If retrying connecting, delay retrys by this amount of milliseconds */
  retryDelay: number;
  /** The websocket URL of the server, ex: ws://localhost:8090 */
  url: string;
}

export const DEFAULT_CONFIG: IMochaRemoteClientConfig = {
  autoConnect: true,
  autoRetry: true,
  retryDelay: 500,
  url: "ws://localhost:8090",
};

const MOCHA_EVENT_NAMES = [
  "start", // `start`  execution started
  "end", // `end`  execution complete
  "suite", // `suite`  (suite) test suite execution started
  "suite end", // (suite) all tests (and sub-suites) have finished
  "test", // (test) test execution started
  "test end", // (test) test completed
  "hook", // (hook) hook execution started
  "hook end", // (hook) hook complete
  "pass", // (test) test passed
  "fail", // (test, err) test failed
  "pending", // (test) test pending
];

export class MochaRemoteClient {
  private config: IMochaRemoteClientConfig;
  private ws?: WebSocket;
  private mocha?: IInstrumentedMocha;
  private runCallback?: RunCallback;
  private retryTimeout?: number;

  constructor(config: Partial<IMochaRemoteClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (typeof(WebSocket) === "undefined") {
      throw new Error("mocha-remote-client expects a global WebSocket");
    } else if (this.config.autoConnect) {
      this.connect();
    }
  }

  public connect(fn?: () => void) {
    debug(`Connecting to ${this.config.url}`);
    this.ws = new WebSocket(this.config.url, "mocha-remote");
    this.ws.addEventListener("error", this.onError.bind(this, fn));
    this.ws.addEventListener("message", this.onMessage);
    this.ws.addEventListener("open", () => {
      debug(`Connected to ${this.config.url}`);
      if (fn) {
        fn();
      }
    });
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      debug(`Disconnected from server`);
      delete this.ws;
    }
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  public instrument(mocha: Mocha, runCallback?: RunCallback) {
    this.mocha = mocha as IInstrumentedMocha;
    this.runCallback = runCallback;
    // Monkey patch the run method
    this.mocha.originalRun = mocha.run;
    mocha.run = () => {
      throw new Error("This Mocha instance has been instrumented by the mocha-remote client, call run on the server");
    };
  }

  public run() {
    if (this.mocha) {
      // Monkey patch the reporter to a method before running
      const reporter = this.createReporter();
      (this.mocha as any)._reporter = reporter;
      // Call the original run method
      return this.mocha.originalRun();
    } else {
      throw new Error("A mocha instance must be instrumented before running");
    }
  }

  private send(eventName: string, ...args: any[]) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const preparedArgs = this.prepareArgs(args);
      const data = stringify({ eventName, args: preparedArgs });
      this.ws.send(data);
    } else {
      throw new Error(`Cannot send ${eventName} WebSocket is closed`);
    }
  }

  private prepareArgs(args: any[]) {
    return args.map((arg) => {
      // Stringifing an Error doesn't extract the message or stacktrace
      // @see https://stackoverflow.com/a/18391400/503899
      if (arg instanceof Error) {
        const result: { [k: string]: any } = {};
        Object.getOwnPropertyNames(arg).forEach((key) => {
            result[key] = (arg as any)[key];
        });
        return result;
      } else {
        return arg;
      }
    });
  }

  private onMessage = (event: { data: string }) => {
    const data = JSON.parse(event.data) as IEventMessage;
    debug(`Received a '${data.eventName}' message`);
    if (data.eventName === "run") {
      // TODO: Receive runtime options from the server and set these on the instrumented mocha instance before running
      const runner = this.run();
      // If the user that instrumented the mocha instance wants a callback called - we'll do that
      if (this.runCallback) {
        this.runCallback(runner);
      }
    }
  }

  private onError = (fn: () => void | undefined, err: Error) => {
    const delay = this.config.retryDelay;
    if (this.config.autoRetry) {
      const shouldReconnect = this.shouldReconnect(err);
      debug(`Failed connecting to server (retrying in ${delay}ms): ${err.message}`);
      if (shouldReconnect) {
        this.retryTimeout = setTimeout(() => {
          this.connect(fn);
        }, this.config.retryDelay) as any as number;
      } else {
        const message = err ? err.stack || err.message : "No message";
        throw new Error(`Failed connecting to server: ${message}`);
      }
    } else {
      throw new Error(`Failed connecting to server: ${err.stack}`);
    }
  }

  private createReporter() {
    const client = this;
    // tslint:disable-next-line:max-classes-per-file
    return class extends Mocha.reporters.Base {
      constructor(runner: Mocha.Runner) {
        super(runner);
        // Loop the names and add listeners for all of them
        MOCHA_EVENT_NAMES.forEach((eventName) => {
          runner.addListener(eventName, client.send.bind(client, eventName));
        });
      }
    };
  }

  private shouldReconnect(err: Error | null) {
    if (!err || !err.message) {
      return true;
    } else if (err.message.indexOf("ECONNREFUSED") >= 0) {
      return true;
    } else if (err.message.indexOf("unexpected end of stream") >= 0) {
      return true;
    } else if (err.message.indexOf("Connection reset") >= 0) {
      return true;
    } else {
      return false;
    }
  }

}
