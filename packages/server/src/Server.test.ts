import { expect } from "chai";
import { WebSocket } from "ws";
import flatted from "flatted";
import { ChildProcess, fork } from "child_process";
import { resolve } from "path";

import { Server } from "./Server";

const protocol = `mocha-remote-${Server.DEFAULT_CONFIG.id}`;

describe("Mocha Remote Server", () => {
  it("can initialize", () => {
    const server = new Server();
    expect(server).to.be.an("object");
  });

  it("can start, run and stop", async () => {
    // Create and start the server
    const server = new Server({ port: 0, reporter: "base" });
    await server.start();

    const client = new WebSocket(server.url, protocol);

    client.once("message", message => {
      const { action } = flatted.parse(message.toString());
      if (action === "run") {
        client.send(flatted.stringify({ action: "event", name: "end" }));
      }
    });

    // A promose that resolves when the client tells the server the root suite ended
    const serverEnded = new Promise<void>(resolve => server.once("end", resolve));

    await server.runAndStop();
    await serverEnded;
  });

  it("propagates context", async () => {
    // Create and start the server
    const server = new Server({
      port: 0,
      reporter: "base",
      context: {
        greeting: "hi",
      },
    });
    await server.start();

    const client = new WebSocket(server.url, protocol);

    client.once("message", message => {
      const { action, options } = flatted.parse(message.toString());
      if (action === "run") {
        // Expect the context to propagate
        expect(options.context).deep.equals({ greeting: "hi" });
        client.send(flatted.stringify({ action: "event", name: "end" }));
      }
    });

    await server.runAndStop();
  });

  it("rejects the run process, on errors", async () => {
    // Create and start the server
    const server = new Server({
      port: 0,
      reporter: "base",
      context: {
        greeting: "hi",
      },
    });
    await server.start();

    const client = new WebSocket(server.url, protocol);

    client.once("message", message => {
      const { action } = flatted.parse(message.toString());
      if (action === "run") {
        // Send back an error
        client.send(flatted.stringify({ action: "error", message: "Something happened" }));
      }
    });

    // Expect the promise returned from running to get rejected
    try {
      await server.runAndStop();
      throw new Error("Expected a rejected promise");
    } catch (err) {
      if (err instanceof Error) {
        expect(err.message).contains("Something happened");
      } else {
        throw new Error(`Expected an error, got ${err}`);
      }
    }
  });
});
