import WebSocket from "ws";
import { Client } from "..";

Client.WebSocket = WebSocket as unknown as typeof Client.WebSocket;

export * from "..";
