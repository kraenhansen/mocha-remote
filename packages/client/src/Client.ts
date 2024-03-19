import type { ServerMessage, ClientMessage, MochaConfig, CustomContext } from "mocha-remote-common";
import { Context, Runner, Suite, interfaces, Interface, createStatsCollector } from "mocha-remote-mocha";
import type { EventEmitter } from "events";
import * as flatted from "flatted";

import { extend, Debugger } from "./debug";
import { ClientEventEmitter, ClientEvents, DisconnectParams } from "./ClientEventEmitter";
import { serialize } from "./serialization";

const {
  EVENT_FILE_PRE_REQUIRE,
  EVENT_FILE_POST_REQUIRE,
  EVENT_FILE_REQUIRE
} = Suite.constants;

type CustomInterface = (rootSuite: Suite) => void;
type InterfaceConfig = Interface | CustomInterface;

type InternalSuite = Suite & { reset: () => void };
type InternalRunner = Runner & { runAsync: (arg: { options: Partial<MochaOptions> }) => Promise<number> };

class MalformedMessageError extends Error {
  public cause?: Error;
  constructor(message: string, cause?: Error) {
    super(cause ? `${message}: ${cause.message}` : message);
    this.cause = cause;
  }
}

class SendMessageFailure extends Error {
  constructor(msg: ServerMessage, cause: string) {
    super(`Failed to send '${msg.action}' message: ${cause}`);
  }
}

type MochaOptions = {
  grep?: RegExp;
  delay?: boolean;
  invert?: boolean;
  context?: CustomContext;
  timeout?: number;
  slow?: number;
};

export type ClientConfig = {
  /**
   * The URL of the Mocha Remote Server to connect to.
   * @default "ws://localhost:8090"
   */
  url: string;
  /**
   * The id to present to the server.
   * @default "default"
   */
  id: string;
  /**
   * Title of the root suite.
   * @default ""
   */
  title: string;
  /**
   * Connect automatically when client is constructed.
   * @default true
   */
  autoConnect: boolean;
  /**
   * Re-connect automatically if the client gets disconnected.
   * @default true
   */
  autoReconnect: boolean;
  /**
   * Disconnect after a run has ended.
   * @default true
   */
  autoDisconnect: boolean;
  /**
   * Delay between attempts to reconnect (in milliseconds).
   * @default 1000
   */
  reconnectDelay: number;
  /**
   * The UI (i.e. "describe", "test", "it", etc.) to present to tests.
   * @default "bdd"
   */
  ui: InterfaceConfig;
  /** A funcion called to load tests */
  tests(context: CustomContext): void | Promise<void>,
} & MochaConfig;

export enum ClientState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  RUNNING = "running",
}

const noop = () => { /* tumbleweed */};

export class Client extends ClientEventEmitter {

  public static WebSocket: typeof WebSocket;
  public static EventEmitter: typeof EventEmitter;
  public static DEFAULT_CONFIG: ClientConfig = {
    autoConnect: true,
    autoReconnect: true,
    autoDisconnect: true,
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

  private static debugCounter = 0;
  private static nextDebug() {
    return extend(`Client[${Client.debugCounter++}]`);
  }

  public suite: Suite;
  public readonly config: ClientConfig;

  private readonly debug: Debugger;
  private previousRunner?: Runner;
  private options: Partial<MochaOptions> = {};
  private _state = ClientState.DISCONNECTED;
  private ws?: WebSocket;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;

  constructor(config: Partial<ClientConfig> = {}, debug = Client.nextDebug()) {
    super(Client.EventEmitter, debug.extend("events"));
    this.debug = debug;
    this.debug("Constructing a client");
    this.config = {  ...Client.DEFAULT_CONFIG, ...config };
    this.suite = Client.createRootSuite(this.config.title);

    this.on("error", (err) => {
      this.send({ action: "error", message: err.message }, false);
    });
    
    this.context(this.config.context);
    this.grep(this.config.grep);
    this.timeout(this.config.timeout);
    this.slow(this.config.slow);
    this.bindInterface();
    if (this.config.autoConnect) {
      this.connect();
    }
  }

  public connect(): Promise<void> {
    if (this._state === ClientState.CONNECTED) {
      throw new Error("Already connected");
    }

    return new Promise((resolve, reject) => {
      const ws = new Client.WebSocket(this.config.url, `mocha-remote-${this.config.id}`);
      this.debug(`Connecting to ${ws.url}`);
      this.ws = ws;
      this._state = ClientState.CONNECTING;

      const errorBeforeConnection = (e: Event) => reject(e);

      ws.addEventListener("close", this.handleClose);

      ws.addEventListener("message", this.handleMessage);

      ws.addEventListener("error", event => {
        const { message } = event as ErrorEvent;
        this.emit(ClientEvents.ERROR, new Error(message));
      });
      
      ws.addEventListener("open", () => {
        this.debug(`Connected to ${ws.url}`);
        this._state = ClientState.CONNECTED;
        // No need to track errors before connection
        ws.removeEventListener("error", errorBeforeConnection);
        this.emit("connection", ws);
        resolve();
      });

      if (!this.config.autoReconnect) {
        // Attaching this since the only failed state from connecting is
        ws.addEventListener("error", errorBeforeConnection);
      }
    })
  }

  public disconnect(): void {
    // Prevent a timeout from reconnecting
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this._state = ClientState.DISCONNECTED;
    if (this.ws) {
      this.debug(`Disconnecting from server`);
      this.ws.close(1000); // Normal Closure
      // Remove the close listener to prevent internal code being triggered by a controlled disconnect
      this.ws.removeEventListener("close", this.handleClose);
      // Forget about the WebSocket
      delete this.ws;
      // Tell the world
      this.emit("disconnection", {});
    } else {
      this.debug(`Already disconnected`);
    }
  }

  public async loadFile(context: CustomContext): Promise<void> {
    this.debug("Loading tests");
    const mocha = this.mockedMocha;
    // Building a fake file path to emit some path via events
    const fakeFilePath = "/mocha-remote-client/mocked-test-suite.js";
    this.suite.emit(EVENT_FILE_PRE_REQUIRE, global, fakeFilePath, mocha);
    // Assing in the context to make it available in hooks
    Object.assign(this.suite.ctx, context);
    // We're treating the value returned from the `result` as the `module.exports` from a file.
    const result = await this.config.tests(context);
    this.suite.emit(EVENT_FILE_REQUIRE, result, fakeFilePath, mocha);
    this.suite.emit(EVENT_FILE_POST_REQUIRE, global, fakeFilePath, mocha);
    this.debug("Loaded %d test(s)", this.suite.total());
  }

  public async run(fn?: (failures: number) => void, runOptions: MochaOptions = {} ): Promise<Runner> {
    this.debug("Preparing to run test suite");
    this._state = ClientState.RUNNING;
    const options = {
      ...this.mockedMocha.options,
      ...runOptions,
      // Merge the contexts
      context: {
        ...this.mockedMocha.options.context,
        ...runOptions.context,
      },
    };

    this.reset();

    if (typeof options.timeout === "number") {
      this.suite.timeout(options.timeout);
    }
    if (typeof options.slow === "number") {
      this.suite.slow(options.slow);
    }
    
    await this.loadFile(options.context);

    const runner = new Runner(this.suite, false);

    // Register listeners for events and update the stats on the runner
    createStatsCollector(runner);

    if (options.grep) {
      runner.grep(options.grep, options.invert || false);
    }

    const runAsync = async (runner: InternalRunner) => {
      return runner.runAsync({ options });
    };

    const done = (failures: number) => {
      this.debug("Completed running (%d failures)", failures);
      this.previousRunner = runner;
      this._state = this.ws ? ClientState.CONNECTED : ClientState.DISCONNECTED;
      if (fn) {
        fn(failures);
      }
    };

    // Abort the runner when disconnected
    this.once("disconnection", () => {
      runner.abort();
    });

    // Setup listeners for all events emitted by the runner
    for (const name in Runner.constants) {
      if (name.startsWith("EVENT")) {
        const eventName = Runner.constants[name as keyof typeof Runner.constants];
        runner.on(eventName, this.sendEvent.bind(this, eventName));
      }
    }

    this.debug("Running test suite");
    runAsync(runner as InternalRunner).then(done, err => {
      this.emit("error", err);
    });

    this.emit("running", runner);

    runner.once(Runner.constants.EVENT_RUN_END, () => {
      this.emit("end", runner.failures);
      if (this.config.autoDisconnect) {
        this.debug("Disconnecting automatically after ended run");
        this.disconnect();
      }
    });

    return runner;
  }

  public context(value: CustomContext | undefined): this {
    this.options.context = value;
    return this;
  }

  public grep(value: RegExp | string | undefined): this {
    this.options.grep = Client.parseGrep(value);
    return this;
  }

  public timeout(value: number | undefined): this {
    this.options.timeout = value;
    return this;
  }

  public slow(value: number | undefined): this {
    this.options.slow = value;
    return this;
  }

  get state(): ClientState {
    if (this.ws) {
      if (this.ws.readyState === this.ws.OPEN) {
        return ClientState.CONNECTED;
      } else if (this.ws.readyState === this.ws.CONNECTING) {
        return ClientState.CONNECTING;
      } else {
        return ClientState.DISCONNECTED;
      }
    } else {
      return this._state;
    }
  }

  /**
   * Resets the internal state to prepare for a potential re-run of the tests.
   * This includes cloning the root suite preparing for a reload of the tests.
   */
  private reset(): void {
    if (this.previousRunner) {
      this.debug("Resetting after a previous run");
      this.previousRunner.dispose();
      delete this.previousRunner;

      const existingSuite = this.suite as InternalSuite;
      // Cloning the suite to allow tests to be loaded into it again
      this.suite = this.suite.clone();
      // Reset and dispose of the old suite
      existingSuite.reset();
      existingSuite.dispose();
      // Bind the interface to the new suite
      this.bindInterface();
    } else {
      this.debug("No need to reset");
    }
  }

  private parseMessage(data: string): ClientMessage {
    try {
      const msg = flatted.parse(data);
      if (typeof msg.action !== "string") {
        throw new MalformedMessageError("Expected an action property");
      }
      return msg as ClientMessage;
    } catch (err) {
      if (err instanceof MalformedMessageError) {
        throw err;
      } else {
        throw new MalformedMessageError("Failed to parse flatted JSON", err instanceof Error ? err : undefined);
      }
    }
  }

  private handleClose = ({ code, reason }: DisconnectParams) => {
    this.debug(`Connection closed: ${reason || "No reason"} (code=${code})`);
    // Forget about the socket
    delete this.ws;
    // Attempt a reconnect
    if (this.config.autoReconnect && this._state !== ClientState.DISCONNECTED && code !== 1000) {
      this._state = ClientState.CONNECTING;
      // Try to reconnect
      this.debug("Re-connecting in %dms", this.config.reconnectDelay);
      this.reconnectTimeout = setTimeout(() => {
        if (this._state === ClientState.CONNECTING) {
          this.connect();
        } else {
          this.debug("Skipped reconnecting, state is '%s'", this._state);
        }
      }, this.config.reconnectDelay);
    } else {
      // TODO: Consider if there's a way to stop all active runners
      this._state = ClientState.DISCONNECTED;
    }
    // Tell the world
    this.emit("disconnection", { code, reason });
  };

  private handleMessage = (event: { data: string }) => {
    try {
      const msg = this.parseMessage(event.data);
      this.debug(`Received a '${msg.action}' message`);
      if (msg.action === "run") {
        if (typeof msg.options !== "object") {
          throw new MalformedMessageError("Expected an options object on 'run' actions");
        }
        const parsedOptions: MochaOptions = {
          ...msg.options,
          grep: Client.parseGrep(msg.options.grep)
        }
        // Kick off a new run
        this.run(noop, parsedOptions).catch((err) => {
          if (err instanceof Error) {
            this.emit("error", err);
          } else {
            this.emit("error", new Error(`Caught a non-error while running: ${err}`));
          }
        });
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
      if (err instanceof Error) {
        this.emit("error", err);
        this.send({ action: "error", message: err.message }, false);
      } else {
        // Rethrowing to avoid swallowing the error, leading to hard to catch bugs
        throw err;
      }
      if (err instanceof MalformedMessageError) {
        this.debug(`Remote Mocha Client received a malformed message: ${err.message}`);
      } else if (this.listenerCount("error") === 0) {
        // Rethrowing to avoid swallowing the error, leading to hard to catch bugs
        throw err;
      }
    }
  };

  private send(msg: ServerMessage, throwOnClosed = true) {
    if (this.ws && this.ws.readyState === Client.WebSocket.OPEN) {
      if (msg.action === "event") {
        this.debug(`Sending a 'event' (${msg.name}) message`);
      } else {
        this.debug(`Sending a '${msg.action}' message`);
      }
      const data = serialize(msg);
      this.ws.send(data);
    } else if (throwOnClosed) {
      throw new SendMessageFailure(msg, "WebSocket is closed");
    }
  }

  private sendEvent(name: string, ...args: unknown[]) {
    try {
      this.send({ action: "event", name, args });
    } catch (err) {
      if (err instanceof SendMessageFailure) {
        this.debug(`Failed to send event: ${err.message}`);
      } else {
        throw err;
      }
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
