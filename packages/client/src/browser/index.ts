import { EventEmitter } from "events";

import { Client } from "..";

Client.WebSocket = global.WebSocket;
Client.EventEmitter = EventEmitter;

export * from "..";
