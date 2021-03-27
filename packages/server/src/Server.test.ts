import { expect } from "chai";
import WebSocket from "ws";

import { Server } from "./Server";

describe("Mocha Remote Server", () => {
  it("can initialize", () => {
    const server = new Server();
    expect(server).to.be.an("object");
  });

  it.skip("can start, run and stop", async () => {
    // Create and start the server
    const server = new Server({ reporter: "base" });
    await server.start();

    const client = new WebSocket(server.getUrl(), "mocha-remote-default");

    client.once("message", message => {
      const { action } = JSON.parse(message);
      if (action === "run") {
        client.send(JSON.stringify({ action: "event", name: "end" }));
      }
    });

    await Promise.all([server.runAndStop()]);
  });
});
