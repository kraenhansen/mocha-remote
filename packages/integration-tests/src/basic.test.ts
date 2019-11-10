import { expect } from "chai";
import Mocha from "mocha";

import { MochaRemoteClient } from "mocha-remote-client";
import { MochaRemoteServer } from "mocha-remote-server";

import { MockedMocha } from "./utils";

describe("basic", () => {
  let server: MochaRemoteServer;
  let client: MochaRemoteClient;

  afterEach(async () => {
    if (client) {
      client.disconnect();
    }
    if (server) {
      await server.stop();
    }
  });

  it("starts on 8090", async () => {
    // Create a server - which is supposed to run in Node
    server = new MochaRemoteServer();
    await server.start();
    expect(server.getUrl()).to.equal("ws://0.0.0.0:8090");
  });

  it("connects", async () => {
    // Create a server - which is supposed to run in Node
    server = new MochaRemoteServer({}, { port: 0 });
    await server.start();
    const serverConnection = new Promise((resolve) => {
      (server as any).wss.once("connection", () => {
        resolve();
      });
    });
    // Create a client - which is supposed to run where the tests are running
    client = new MochaRemoteClient({ autoConnect: false, url: server.getUrl() });
    // Await the client connecting and the server emitting an event
    await Promise.all([
      serverConnection,
      new Promise((resolve) => client.connect(resolve)),
    ]);
  });

  it("can start client from the server", async () => {
    // Create a server - which is supposed to run in Node
    server = new MochaRemoteServer({
      reporter: "base", /* to prevent output */
    }, {
      id: "tests",
      port: 0,
    });
    await server.start();

    // Let's instrument the mocha instance and resolve a promise when the tests start
    const clientRunningPromise = new Promise((resolve) => {
      // Create a client - which is supposed to run where the tests are running
      client = new MochaRemoteClient({
        id: "tests",
        url: server.getUrl(),
        whenRunning: (runner) => {
          runner.once("end", resolve);
        },
      });
      const mocha = new MockedMocha() as Mocha;
      client.instrument(mocha);
    });

    await new Promise((resolve) => {
      // Asking the server to start the run
      server.run((failures) => {
        expect(failures).to.equal(0);
        resolve();
      });
    });

    await clientRunningPromise;
  });

  it("disconnects the client if ids mismatch", async () => {
    // Create a server - which is supposed to run in Node
    server = new MochaRemoteServer({
      reporter: "base", /* to prevent output */
    }, {
      callbacks: {
        clientConnection: () => {
          throw new Error("Client connected unexpectedly");
        },
      },
      id: "a-non-default-id",
      port: 0,
    });
    await server.start();
    // Let's instrument the mocha instance and resolve a promise when the tests start
    await new Promise((resolve) => {
      // Create a client - which is supposed to run where the tests are running
      client = new MochaRemoteClient({
        url: server.getUrl(),
        whenDisconnected: ({ code, reason }) => {
          expect(code).to.equal(1002);
          expect(reason).to.equal("Expected a different protocol (mocha-remote:a-non-default-id)");
          resolve();
        },
      });
    });
  });
});
