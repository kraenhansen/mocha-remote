import * as Debug from "debug";
import { stringify } from "flatted";
import * as WebSocket from "isomorphic-ws";
import * as Mocha from "mocha";

interface IEventMessage {
  eventName: string;
  args: any[];
}

export type RunCallback = (runner: Mocha.Runner) => void;

interface IInstrumentedMocha extends Mocha {
  originalRun: (fn?: (failures: number) => void) => Mocha.Runner;
  onRun?: RunCallback;
}

const debug = Debug("mocha-remote:client");

export interface IMochaRemoteClientConfig {
  autoConnect: boolean;
  /** Fail silently and perform automatic retrying when connecting to the server */
  autoRetry: boolean;
  /** If retrying connecting, delay retrys by this amount of milliseconds */
  retryDelay: number;
  /** The websocket URL of the server, ex: ws://localhost:8090 */
  url: string;
  /** Called when the client gets connected to the server */
  whenConnected?: (ws: WebSocket) => void;
  /** Called when the client has a new instrumented mocha instance */
  whenInstrumented?: (mocha: Mocha) => void;
  /** Called when the server has decided to start running */
  whenRunning?: (runner: Mocha.Runner) => void;
  /** Called when the client needs a new Mocha instance */
  createMocha: (config: IMochaRemoteClientConfig) => Mocha;
  /** These options are passed to the Mocha constructor when creating a new instance */
  mochaOptions: Mocha.MochaOptions;
}

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
  public static Mocha = Mocha;
  public static DEFAULT_CONFIG: IMochaRemoteClientConfig = {
    autoConnect: true,
    autoRetry: true,
    createMocha: (config) => new Mocha(config.mochaOptions),
    mochaOptions: {},
    retryDelay: 500,
    url: "ws://localhost:8090",
  };

  private config: IMochaRemoteClientConfig;
  private ws?: WebSocket;
  private nextMocha?: IInstrumentedMocha;
  private retryTimeout?: number;

  constructor(config: Partial<IMochaRemoteClientConfig> = {}) {
    this.config = { ...MochaRemoteClient.DEFAULT_CONFIG, ...config };
    if (typeof(WebSocket) === "undefined") {
      throw new Error("mocha-remote-client expects a global WebSocket");
    } else if (this.config.autoConnect) {
      this.connect();
    }
  }

  public connect(fn?: () => void) {
    if (this.ws) {
      throw new Error("Already connected");
    }
    // Prevent a timeout from reconnecting
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
    debug(`Connecting to ${this.config.url}`);
    this.ws = new WebSocket(this.config.url, "mocha-remote");
    this.ws.addEventListener("close", this.onClose);
    this.ws.addEventListener("error", this.onError as any);
    this.ws.addEventListener("message", this.onMessage);
    this.ws.addEventListener("open", (e) => {
      debug(`Connected to ${this.config.url}`);
      if (this.config.whenConnected) {
        this.config.whenConnected(e.target as WebSocket);
      }
      if (fn) {
        fn();
      }
    });
  }

  public disconnect() {
    // Prevent a timeout from reconnecting
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
    if (this.ws) {
      debug(`Disconnecting from server`);
      // Stop listening for the closing events to prevent reconnecting
      this.ws.removeEventListener("close", this.onClose);
      this.ws.removeEventListener("error", this.onError as any);
      this.ws.removeEventListener("message", this.onMessage);
      this.ws.close();
      // Forget about the WebSocket
      delete this.ws;
    } else {
      debug(`Disconnecting from server`);
    }
  }

  public instrument(mocha: Mocha) {
    const instrumentedMocha = mocha as IInstrumentedMocha;
    // Monkey patch the run method
    instrumentedMocha.originalRun = mocha.run;
    instrumentedMocha.run = () => {
      throw new Error("This Mocha instance is instrumented by mocha-remote-client, use the server to run tests");
    };
    // The reporter method might require files that do not exist when required from a bundle
    instrumentedMocha.reporter = () => {
      // tslint:disable-next-line:no-console
      console.warn("This Mocha instance is instrumented by mocha-remote-client, setting a reporter has no effect");
      return instrumentedMocha;
    };
    // Notify that a Mocha instance is now instrumented
    if (this.config.whenInstrumented) {
      this.config.whenInstrumented(instrumentedMocha);
    }
    // Hang on to this instance
    this.nextMocha = instrumentedMocha;
    // Add this to the list of instrumented mochas
    return instrumentedMocha;
  }

  public run(mocha: IInstrumentedMocha): Mocha.Runner {
    // Monkey patch the reporter to a method before running
    const reporter = this.createReporter();
    (mocha as any)._reporter = reporter;
    // Call the original run method
    const runner = mocha.originalRun();
    // Signal that the mocha instance is now running
    if (this.config.whenRunning) {
      this.config.whenRunning(runner);
    }
    // Return the runner
    return runner;
  }

  public getMocha(): IInstrumentedMocha {
    if (this.nextMocha) {
      // Use the latest instrumented mocha instance - if it exists
      return this.nextMocha;
    } else {
      // Create a new Mocha instance
      const mocha = this.config.createMocha(this.config);
      return this.instrument(mocha);
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

  private onClose = ({ code, reason }: { code: number, reason: string }) => {
    debug(`Connection closed: ${reason || "No reason"} (code=${code})`);
    // Forget about the client
    delete this.ws;
    // Try reconnecting
    if (code !== 1000 && this.config.autoRetry) {
    // Try to reconnect
      debug(`Re-connecting in ${this.config.retryDelay}ms`);
      this.retryTimeout = setTimeout(() => {
        this.connect();
      }, this.config.retryDelay) as any as number;
    }
  }

  private onError = ({ error }: { error: Error }) => {
    debug(`WebSocket error: ${error.message || "No message"}`);
  }

  private onMessage = (event: { data: string }) => {
    const data = JSON.parse(event.data) as IEventMessage;
    debug(`Received a '${data.eventName}' message`);
    if (data.eventName === "run") {
      // TODO: Receive runtime options from the server and set these on the instrumented mocha instance before running
      const mocha = this.getMocha();
      delete this.nextMocha;
      this.run(mocha);
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
