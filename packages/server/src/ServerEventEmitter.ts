import { EventEmitter } from "events";
import TypedEmitter from "typed-emitter";
import type WebSocket from "ws";
import type http from "http";
import type { Debugger } from "debug";

import type { Server } from "./Server";
import type { Runner } from "mocha";

export enum ServerEvents {
  STARTED = "started",
  RUNNING = "running",
  CONNECTION = "connection",
  DISCONNECTION = "disconnection",
  ERROR = "error",
  END = "end",
}

export type StartedListener = (server: Server) => void;
export type RunningListener = (runner: Runner) => void;
export type ConnectionListener = (ws: WebSocket, req: http.IncomingMessage) => void;
export type DisconnectionListener = (ws: WebSocket, code: number, reason: string) => void;
export type ErrorListener = (error: Error) => void;
export type EndListener = () => void;

export type MessageEvents = {
  started: StartedListener,
  connection: ConnectionListener,
  disconnection: DisconnectionListener,
  error: ErrorListener,
  end: EndListener,
  running: RunningListener,
  /*
  test: TestListener,
  */
}

export class ServerEventEmitter implements TypedEmitter<MessageEvents> {
  private emitter: EventEmitter;

  constructor(debug: Debugger) {
    this.emitter = new EventEmitter();
    for (const name of Object.values(ServerEvents)) {
      this.on(name, (...args: unknown[]) => debug(`'%s' event emitted: %o`, name, args));
    }
  }

  public addListener<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.addListener(event, listener);
    return this;
  }

  public removeListener<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.removeListener(event, listener);
    return this;
  }

  public removeAllListeners<E extends keyof MessageEvents>(event?: E): this {
    this.emitter.removeAllListeners(event);
    return this;
  }

  public on<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.on(event, listener);
    return this;
  }

  public once<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.once(event, listener);
    return this;
  }

  public off<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.off(event, listener);
    return this;
  }

  public emit<E extends keyof MessageEvents>(event: E, ...args: Parameters<MessageEvents[E]>): boolean {
    return this.emitter.emit(event, ...args);
  }

  public setMaxListeners(n: number): this {
    this.emitter.setMaxListeners(n);
    return this;
  }

  public getMaxListeners(): number {
    return this.emitter.getMaxListeners();
  }

  public listeners<E extends keyof MessageEvents>(event: E): MessageEvents[E][] {
    return this.emitter.listeners(event) as MessageEvents[E][];
  }

  public rawListeners<E extends keyof MessageEvents>(event: E): MessageEvents[E][] {
    return this.emitter.rawListeners(event) as MessageEvents[E][];
  }

  public listenerCount<E extends keyof MessageEvents>(event: E): number {
    return this.emitter.listenerCount(event);
  }

  public prependListener<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.prependListener(event, listener);
    return this;
  }

  public prependOnceListener<E extends keyof MessageEvents>(event: E, listener: MessageEvents[E]): this {
    this.emitter.prependOnceListener(event, listener);
    return this;
  }

  public eventNames(): (keyof MessageEvents)[] {
    return Object.values(ServerEvents);
  }
}
