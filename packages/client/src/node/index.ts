import WebSocket from "ws";
import EventEmitter from "events";

import { Client } from "..";

Client.WebSocket = WebSocket as unknown as typeof Client.WebSocket;
Client.EventEmitter = EventEmitter;

export * from "..";
