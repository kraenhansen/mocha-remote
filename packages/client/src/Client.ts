import { Context, Runner, Suite, interfaces, Interface } from "mocha-remote-mocha";
export { Context, Runner, Suite, interfaces, Interface };

import { extend } from "./debug";

const debug = extend("Client");

const {
  EVENT_FILE_PRE_REQUIRE,
  EVENT_FILE_POST_REQUIRE,
  EVENT_FILE_REQUIRE
} = Suite.constants;

type DisconnectParams = {
  code: number;
  reason: string;
}

type CustomInterface = (rootSuite: Suite) => void;
type InterfaceConfig = Interface | CustomInterface;

type InternalSuite = Suite & { reset: () => void };
type InternalRunner = Runner & { runAsync: (arg: { options: Partial<MochaOptions> }) => Promise<number> };

type RunMessage = { action: "run", options: Partial<MochaOptions> };
type IncomingMessage = RunMessage;

// TODO: Receive these from the server
type MochaOptions = {
  grep: RegExp;
  delay: boolean;
  invert: boolean;
};

type MochaConfig = {
  grep?: RegExp | string;
  delay?: boolean;
  invert?: boolean;
};

export type ClientConfig = {
  url: string;
  id: string;
  /** Title of the root suite */
  title: string;
  autoConnect: boolean;
  autoReconnect: boolean;
  reconnectDelay: number;
  ui: InterfaceConfig;
  tests(): void,
  onConnected(ws: WebSocket): void,
  onDisconnected(params: DisconnectParams): void,
  onRunning(runner: Runner): void,
} & MochaConfig;

export enum ClientState {
  DISCONNECTED = "disconnected",
  CONNECTED = "connected",
  RUNNING = "running",
}

export class Client {

  public static WebSocket: typeof WebSocket;

  private static createRootSuite() {
    const context = new Context();
    const suite = new Suite('', context);
    suite.root = true;
    return suite;
  }

  private static parseGrep(value: RegExp | string | undefined): RegExp | undefined {
    if (typeof value === "string") {
      const arg = value.match(/^\/(.*)\/(g|i|)$|.*/);
      if (arg) {
        return new RegExp(arg[1] || arg[0], arg[2]);
      } else {
        throw new Error(`Failed to parse grep string: ${value}`);
      }
    } else {
      return value;
    }
  }

  private static DEFAULT_CONFIG: ClientConfig = {
    autoConnect: true,
    autoReconnect: true,
    id: "default",
    title: "Mocha Remote",
    reconnectDelay: 1000,
    url: "ws://localhost:8090",
    ui: "bdd",
    tests: () => {
      throw new Error("You must configure an `tests` function");
    },
    onConnected: () => { /* */ },
    onDisconnected: () => { /* */ },
    onRunning: () => { /* */ },
  }

  public readonly config: ClientConfig;
  public readonly suite: Suite = Client.createRootSuite();
  private previousRunner?: Runner;
  private options: Partial<MochaOptions> = {};
  private _state = ClientState.DISCONNECTED;
  private ws?: WebSocket;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;

  constructor(config: Partial<ClientConfig> = {}) {
    debug("Constructed a client");
    this.config = { 
      ...Client.DEFAULT_CONFIG, ...config,
    };
    this.grep(this.config.grep);
    this.bindInterface();
    if (this.config.autoConnect) {
      this.connect();
    }
  }

  public connect(): Promise<void> {
    if (this._state !== ClientState.DISCONNECTED || this.ws) {
      throw new Error("Already connected");
    }

    return new Promise((resolve, reject) => {
      const ws = new Client.WebSocket(this.config.url, `mocha-remote-${this.config.id}`);
      debug(`Connecting to ${ws.url}`);
      this.ws = ws;

      ws.addEventListener("close", ({ code, reason }: DisconnectParams) => {
        debug(`Connection closed: ${reason || "No reason"} (code=${code})`);
        if (this._state !== ClientState.DISCONNECTED) {
          // Forget about the client
          delete this.ws;
          // TODO: Consider if there's a way to stop all active runners
          this._state = ClientState.DISCONNECTED;
          // Try reconnecting
          if (code !== 1000 && this.config.autoReconnect) {
            // Try to reconnect
            debug(`Re-connecting in ${this.config.reconnectDelay}ms`);
            this.reconnectTimeout = setTimeout(() => {
              this.connect();
            }, this.config.reconnectDelay);
          }
          if (this.config.onDisconnected) {
            this.config.onDisconnected({ code, reason });
          }
        }
      });

      ws.addEventListener("message", this.handleMessage);

      ws.addEventListener("error", e => {
        // const err = new Error(`Failed to connect (${e.error})`);
        console.error(e);
      });
      
      ws.addEventListener("open", e => {
        debug(`Connected to ${ws.url}`);
        this._state = ClientState.CONNECTED;
        this.config.onConnected(ws);
        resolve();
      });
    })
  }

  public disconnect(): void {
    // Prevent a timeout from reconnecting
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this._state = ClientState.DISCONNECTED;
    if (this.ws) {
      debug(`Disconnecting from server`);
      this.ws.close();
      // Forget about the WebSocket
      delete this.ws;
    } else {
      debug(`Already disconnected`);
    }
  }

  public loadFile(): void {
    debug("Loading tests");
    const mocha = this.mockedMocha;
    // Building a fake file path to emit some path via events
    const fakeFilePath = "/mocha-remote-client/mocked-test-suite.js";
    this.suite.emit(EVENT_FILE_PRE_REQUIRE, global, fakeFilePath, mocha);
    // We're treating the value returned from the onLoad the `module.exports` from a file.
    const result = this.config.tests();
    this.suite.emit(EVENT_FILE_REQUIRE, result, fakeFilePath, mocha);
    this.suite.emit(EVENT_FILE_POST_REQUIRE, global, fakeFilePath, mocha);
    debug("Loaded tests", this.suite);
  }

  public run(fn?: (failures: number) => void, runOptions: Partial<MochaOptions> = {} ): Runner {
    debug("Running tests");
    this._state = ClientState.RUNNING;
    if (this.previousRunner) {
      this.previousRunner.dispose();
      (this.suite as InternalSuite).reset();
    }
    this.loadFile();
    const runner = new Runner(this.suite, false);
    const options = {
      ...this.mockedMocha.options,
      ...runOptions,
    };

    if (options.grep) {
      runner.grep(options.grep, options.invert || false);
    }

    const done = (failures: number) => {
      debug(`Completed running (${failures} failures)`);
      this.previousRunner = runner;
      this._state = this.ws ? ClientState.CONNECTED : ClientState.DISCONNECTED;
      // TODO: Tell the server
      if (fn) {
        fn(failures);
      }
    };

    const runAsync = async (runner: InternalRunner) => {
      return runner.runAsync({ options });
    };

    runAsync(runner as InternalRunner).then(done);

    this.config.onRunning(runner);

    return runner;
  }

  public grep(value: RegExp | string | undefined): this {
    this.options.grep = Client.parseGrep(value);
    return this;
  }

  get state(): ClientState {
    return this._state;
  }

  private handleMessage = (event: { data: string }) => {
    const data: IncomingMessage = JSON.parse(event.data);
    debug(`Received a '${data.action}' message`);
    if (data.action === "run") {
      const options = {
        grep: Client.parseGrep(data.options.grep)
      }
      this.run(() => {
        // TODO: Perhaps we should disconnect?
      }, options);
    } else {
      console.warn(`Remote Mocha Client received an unexpected message: ${data.action}`);
    }
  };

  private send(eventName: string, ...args: unknown[]) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      /*
      const preparedArgs = this.prepareArgs(args);
      const data = stringify({ eventName, args: preparedArgs });
      debug(`Sending a '${eventName}' message`);
      this.ws.send(data);
      */
      throw new Error("Not yet implemented");
    } else {
      throw new Error(`Cannot send ${eventName} WebSocket is closed`);
    }
  }

  private bindInterface() {
    const { ui } = this.config;
    const bind = typeof ui === "function" ? ui : interfaces[ui];
    bind(this.suite);
  }

  private get mockedMocha() {
    return {
      options: {
        files: [],
        ...this.options,
      },
    }
  }
}
