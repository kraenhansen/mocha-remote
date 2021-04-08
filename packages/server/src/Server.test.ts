import { expect } from "chai";
import WebSocket from "ws";
import flatted from "flatted";

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
      const { action } = flatted.parse(message);
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
      const { action, options } = flatted.parse(message);
      if (action === "run") {
        // Expect the context to propagate
        expect(options.context).deep.equals({ greeting: "hi" });
        client.send(flatted.stringify({ action: "event", name: "end" }));
      }
    });

    await server.runAndStop();
  });
});
