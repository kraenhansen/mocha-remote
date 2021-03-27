import * as EventEmitterPolyfill from "events";
import type { EventEmitter } from "events";

import { Client } from "..";

Client.WebSocket = global.WebSocket;
Client.EventEmitter = EventEmitterPolyfill as unknown as typeof EventEmitter;

export * from "..";
