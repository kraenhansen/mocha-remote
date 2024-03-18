import WebSocket from "ws";
import EventEmitter from "events";
import { Client } from "..";
Client.WebSocket = WebSocket;
Client.EventEmitter = EventEmitter;
const { MOCHA_REMOTE_URL } = process.env;
if (MOCHA_REMOTE_URL) {
    Client.DEFAULT_CONFIG.url = MOCHA_REMOTE_URL;
}
export * from "..";
//# sourceMappingURL=index.js.map