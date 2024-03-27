import { EventEmitter } from "events";

import { Client } from "..";

Client.WebSocket = WebSocket;
Client.EventEmitter = EventEmitter;

export * from "..";
