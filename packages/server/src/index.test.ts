import { expect } from "chai";
import WebSocket from "ws";
import { stringify } from "flatted";

import { MochaRemoteServer } from ".";

describe("MochaRemoteServer", () => {
  it("can initialize", () => {
    const server = new MochaRemoteServer();
    expect(server).to.be.an("object");
  });

  it("can start, run and stop", async () => {
    // Create and start the server
    const server = new MochaRemoteServer({ reporter: "base" });
    await server.start();

    const client = new WebSocket(server.getUrl(), "mocha-remote-default");

    client.once("message", message => {
      const { eventName } = JSON.parse(message);
      if (eventName === "run") {
        client.send(stringify({ eventName: "end", args: [] }));
      }
    });

    await Promise.all([server.runAndStop()]);
  });
});
