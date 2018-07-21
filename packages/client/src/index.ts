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

const debug = Debug("mocha-remote:client");

export interface IMochaRemoteClientConfig {
  url: string;
}

const DEFAULT_CONFIG: IMochaRemoteClientConfig = {
  url: "http://localhost:8090",
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

  constructor(config: Partial<IMochaRemoteClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (typeof(WebSocket) === "undefined") {
      throw new Error("mocha-remote-client expects a global WebSocket");
    }
  }

  public connect() {
    return new Promise((resolve) => {
      this.ws = new WebSocket(this.config.url, "mocha-remote");
      this.ws.addEventListener("message", this.onMessage);
      this.ws.addEventListener("open", () => {
        debug(`Connected to ${this.config.url}`);
        resolve();
      });
    });
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      debug(`Disconnected from server`);
      delete this.ws;
    }
  }

  public instrument(mocha: Mocha) {
    this.mocha = mocha as IInstrumentedMocha;
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
      this.run();
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

}
