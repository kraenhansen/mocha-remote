import type { EventEmitter } from "events";
import TypedEmitter from "typed-emitter";
import type { Runner } from "mocha-remote-mocha";
import type { Debugger } from "debug";

export type DisconnectParams = {
  code: number;
  reason: string;
}

export enum ClientEvents {
  CONNECTION = "connection",
  DISCONNECTION = "disconnection",
  ERROR = "error",
  RUNNING = "running",
  TEST = "test",
  END = "end",
}

export type ConnectListener = (ws: WebSocket) => void;
export type DisconnectListener = (params: Partial<DisconnectParams>) => void;
export type ErrorListener = (e: Error) => void;
export type RunningListener = (runner: Runner) => void;
export type TestListener = () => void;
export type EndListener = (failures: number) => void;

export type MessageEvents = {
  connection: ConnectListener,
  disconnection: DisconnectListener,
  error: ErrorListener,
  running: RunningListener,
  test: TestListener,
  end: EndListener,
}

export class ClientEventEmitter implements TypedEmitter<MessageEvents> {
  private emitter: EventEmitter;

  constructor(EventEmitterType: typeof EventEmitter, debug: Debugger) {
    this.emitter = new EventEmitterType();
    for (const name of Object.values(ClientEvents)) {
      this.on(name, (...args: unknown[]) => debug(`'%s' event emitted: %o`, name, args));
    }
  }

  public addListener<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.addListener.call(this.emitter, event, listener);
    return this;
  }

  public removeListener<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.removeListener.call(this.emitter, event, listener);
    return this;
  }

  public removeAllListeners<E extends keyof MessageEvents>(event?: E): this {
    this.emitter.removeAllListeners.call(this.emitter, event);
    return this;
  }

  public on<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.on.call(this.emitter, event, listener);
    return this;
  }

  public once<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.addListener.call(this.emitter, event, listener);
    return this;
  }

  public off<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.addListener.call(this.emitter, event, listener);
    return this;
  }

  public emit<E extends keyof MessageEvents>(event: E, ...args: Parameters<MessageEvents[E]>): boolean {
    return this.emitter.emit.call(this.emitter, event, ...args);
  }

  public setMaxListeners(n: number): this {
    this.emitter.setMaxListeners.call(this.emitter, n);
    return this;
  }

  public getMaxListeners(): number {
    return this.emitter.getMaxListeners.call(this.emitter);
  }

  public listeners<E extends keyof MessageEvents>(event: E): MessageEvents[E][] {
    return this.emitter.listeners.call(this.emitter, event) as MessageEvents[E][];
  }

  public rawListeners<E extends keyof MessageEvents>(event: E): MessageEvents[E][] {
    return this.emitter.rawListeners.call(this.emitter, event) as MessageEvents[E][];
  }

  public listenerCount<E extends keyof MessageEvents>(event: E): number {
    return this.emitter.listenerCount.call(this.emitter, event);
  }

  public prependListener<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.prependListener.call(this.emitter, event, listener);
    return this;
  }

  public prependOnceListener<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.prependOnceListener.call(this.emitter, event, listener);
    return this;
  }

  public eventNames(): (keyof MessageEvents)[] {
    return Object.values(ClientEvents);
  }
}
