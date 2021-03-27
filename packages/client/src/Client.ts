import { Context, Runner, Suite, interfaces, Interface } from "mocha-remote-mocha";
import type { EventEmitter } from "events";

import type { ServerMessage } from "../../../types/server";
import type { ClientMessage, MochaConfig } from "../../../types/client";

import { extend } from "./debug";
import { ClientEventEmitter, ClientEvents, DisconnectParams } from "./ClientEventEmitter";

const debug = extend("Client");

const {
  EVENT_FILE_PRE_REQUIRE,
  EVENT_FILE_POST_REQUIRE,
  EVENT_FILE_REQUIRE
} = Suite.constants;

type CustomInterface = (rootSuite: Suite) => void;
type InterfaceConfig = Interface | CustomInterface;

type InternalSuite = Suite & { reset: () => void };
type InternalRunner = Runner & { runAsync: (arg: { options: Partial<MochaOptions> }) => Promise<number> };

class MalformedMessageError extends Error {}

// TODO: Receive these from the server
type MochaOptions = {
  grep?: RegExp;
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
} & MochaConfig;

export enum ClientState {
  DISCONNECTED = "disconnected",
  CONNECTED = "connected",
  RUNNING = "running",
}

export class Client extends ClientEventEmitter {

  public static WebSocket: typeof WebSocket;
  public static EventEmitter: typeof EventEmitter;
  public static DEFAULT_CONFIG: ClientConfig = {
    autoConnect: true,
    autoReconnect: true,
    id: "default",
    title: "",
    reconnectDelay: 1000,
    url: "ws://localhost:8090",
    ui: "bdd",
    tests: () => {
      throw new Error("You must configure an `tests` function");
    },
  }

  private static createRootSuite(title: string) {
    const context = new Context();
    const suite = new Suite(title, context);
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

  public readonly config: ClientConfig;
  public readonly suite: Suite;

  private previousRunner?: Runner;
  private options: Partial<MochaOptions> = {};
  private _state = ClientState.DISCONNECTED;
  private ws?: WebSocket;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;

  constructor(config: Partial<ClientConfig> = {}) {
    super(Client.EventEmitter);
    debug("Constructing a client");
    this.config = {  ...Client.DEFAULT_CONFIG, ...config };
    this.suite = Client.createRootSuite(this.config.title);
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

      const errorBeforeConnection = (e: Event) => reject(e);

      ws.addEventListener("close", ({ code, reason }: DisconnectParams) => {
        debug(`Connection closed: ${reason || "No reason"} (code=${code})`);
        // Forget about the client
        delete this.ws;
        // Attempt a reconnect
        if (this.config.autoReconnect && this._state !== ClientState.DISCONNECTED) {
          // Try reconnecting
          if (code !== 1000) {
            // Try to reconnect
            debug(`Re-connecting in ${this.config.reconnectDelay}ms`);
            this.reconnectTimeout = setTimeout(() => {
              this.connect();
            }, this.config.reconnectDelay);
          }
        }
        // TODO: Consider if there's a way to stop all active runners
        this._state = ClientState.DISCONNECTED;
        // Tell the world
        this.emit("disconnect", { code, reason });
      });

      ws.addEventListener("message", this.handleMessage);

      ws.addEventListener("error", event => {
        const { message } = event as ErrorEvent;
        this.emit(ClientEvents.ERROR, new Error(message));
      });
      
      ws.addEventListener("open", () => {
        debug(`Connected to ${ws.url}`);
        this._state = ClientState.CONNECTED;
        // No need to track errors before connection
        ws.removeEventListener("error", errorBeforeConnection);
        this.emit("connect", ws);
        resolve();
      });

      ws.addEventListener("error", errorBeforeConnection);
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

  public run(fn?: (failures: number) => void, runOptions: MochaOptions = {} ): Runner {
    debug("Preparing to run test suite");
    this._state = ClientState.RUNNING;
    if (this.previousRunner) {
      this.previousRunner.dispose();
      (this.suite as InternalSuite).reset();
    }
    this.loadFile();
    const runner = new Runner(this.suite, false);
    const options = { ...this.mockedMocha.options, ...runOptions };

    if (options.grep) {
      runner.grep(options.grep, options.invert || false);
    }

    const runAsync = async (runner: InternalRunner) => {
      return runner.runAsync({ options });
    };

    const done = (failures: number) => {
      debug(`Completed running (${failures} failures)`);
      this.previousRunner = runner;
      this._state = this.ws ? ClientState.CONNECTED : ClientState.DISCONNECTED;
      // TODO: Tell the server
      if (fn) {
        fn(failures);
      }
    };

    debug("Running test suite");
    runAsync(runner as InternalRunner).then(done);

    this.emit("running", runner);

    runner.once(Runner.constants.EVENT_RUN_END, () => {
      this.emit("end", runner.failures);
    });

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
    try {
      const msg = JSON.parse(event.data) as ClientMessage;
      if (typeof msg.action !== "string") {
        throw new MalformedMessageError("Expected an action property");
      }

      debug(`Received a '${msg.action}' message`);
      if (msg.action === "run") {
        if (typeof msg.options !== "object") {
          throw new MalformedMessageError("Expected an options object on 'run' actions");
        }
        const parsedOptions: MochaOptions = {
          grep: Client.parseGrep(msg.options.grep)
        }
        this.run(() => {
          // TODO: Perhaps we should disconnect?
        }, parsedOptions);
      } else if (msg.action === "error") {
        if (typeof msg.message === "string") {
          this.emit("error", new Error(msg.message));
        } else {
          throw new MalformedMessageError("Expected 'error' action to have an error argument with a message");
        }
      } else {
        const { action } = msg;
        throw new MalformedMessageError(`Unexpected action '${action}'`);
      }
    } catch (err) {
      if (err instanceof MalformedMessageError || err instanceof SyntaxError) {
        debug(`Remote Mocha Client received a malformed message: ${err.message}`);
        this.send({ action: "error", message: err.message });
        this.emit("error", err);
      } else {
        this.emit("error", err);
        throw err;
      }
    }
  };

  private send(msg: ServerMessage) {
    if (this.ws && this.ws.readyState === Client.WebSocket.OPEN) {
      /*
      const preparedArgs = this.prepareArgs(args);
      const data = stringify({ eventName, args: preparedArgs });
      */
      debug(`Sending a '${msg.action}' message`);
      const data = JSON.stringify(msg);
      this.ws.send(data);
    } else {
      throw new Error(`Cannot send '${msg.action}': WebSocket is closed`);
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
