import { EventEmitter } from "events";
import TypedEmitter, { Arguments } from "typed-emitter";
import type WebSocket from "ws";
import type http from "http";

import type { Server } from "./Server";

export enum ClientEvents {
  DISCONNECTED = "disconnected",
  CONNECTED = "connected",
  ERROR = "error",
  RUNNING = "running",
  TEST = "test",
  END = "end",
}

export type StartedListener = (server: Server) => void;
export type ConnectionListener = (ws: WebSocket, req: http.IncomingMessage) => void;
export type DisconnectionListener = (ws: WebSocket, code: number, reason: string) => void;
export type ErrorListener = (error: Error) => void;

export type MessageEvents = {
  started: StartedListener,
  connection: ConnectionListener,
  disconnection: DisconnectionListener,
  error: ErrorListener,
  /*
  running: RunningListener,
  test: TestListener,
  end: EndListener,
  */
}

export class ServerEventEmitter implements TypedEmitter<MessageEvents> {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
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

  public emit<E extends keyof MessageEvents>(event: E, ...args: Arguments<MessageEvents[E]>): boolean {
    return this.emitter.emit.call(this.emitter, event, ...args);
  }

  public setMaxListeners(n: number): this {
    this.emitter.setMaxListeners.call(this.emitter, n);
    return this;
  }

  public getMaxListeners(): number {
    return this.emitter.getMaxListeners.call(this.emitter);
  }

  /* eslint-disable-next-line @typescript-eslint/ban-types */
  public listeners<E extends keyof MessageEvents>(event: E): (Function)[] {
    return this.emitter.listeners.call(this.emitter, event);
  }

  /* eslint-disable-next-line @typescript-eslint/ban-types */
  public rawListeners<E extends keyof MessageEvents>(event: E): Function[] {
    return this.emitter.rawListeners.call(this.emitter, event);
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
    return ["started", "connection", "disconnection", "error"];
  }
}
