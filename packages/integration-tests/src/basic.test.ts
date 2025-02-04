import { expect } from "chai";

import { Client } from "mocha-remote-client";
import { Server } from "mocha-remote-server";

describe("basic", () => {
  let server: Server;
  let client: Client;

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
    server = new Server();
    await server.start();
    expect(server.url).to.oneOf([
      "ws://localhost:8090",
      "ws://127.0.0.1:8090",
      "ws://[::1]:8090"
    ]);
  });

  it("connects", async () => {
    // Create a server - which is supposed to run in Node
    server = new Server({ port: 0 });
    await server.start();
    const serverConnection = new Promise<void>(resolve => {
      // @ts-expect-error -- Accessing a private API
      server.wss.once("connection", () => {
        resolve();
      });
    });
    // Create a client - which is supposed to run where the tests are running
    client = new Client({
      autoConnect: false,
      url: server.url,
    });
    // Await the client connecting and the server emitting an event
    await Promise.all([
      serverConnection,
      client.connect()
    ]);
  });

  it("can start client from the server", async () => {
    // Create a server - which is supposed to run in Node
    server = new Server({
      reporter: "base", // to prevent output
      id: "tests",
      port: 0
    });
    await server.start();

    let testRan = false;
    // Create a client - which is supposed to run where the tests are running
    client = new Client({
      id: "tests",
      url: server.url,
      autoConnect: true,
      tests: () => {
        it("works", () => {
          // Tumbleweed
          testRan = true;
        });
      },
    });
    
    await new Promise<void>(resolve => {
      // Asking the server to start the run
      server.run(failures => {
        expect(failures).to.equal(0);
        resolve();
      });
    });

    expect(testRan).equals(true);
  });

  it("disconnects the client if ids mismatch", async () => {
    // Create a server - which is supposed to run in Node
    server = new Server({
      reporter: "base", /* to prevent output */
      id: "a-non-default-id",
      port: 0
    });
    await server.start();
    // Let's instrument the mocha instance and resolve a promise when the tests start
    await new Promise<void>(resolve => {
      // Create a client - which is supposed to run where the tests are running
      client = new Client({ url: server.url });
      client.once("disconnection", ({ code, reason }) => {
        expect(code).to.equal(1002);
        expect(reason).to.equal(
          'Expected "mocha-remote-a-non-default-id" protocol got "mocha-remote-default"'
        );
        resolve();
      });
    });
  });

  it("expose the total number of tests on a Suite", async () => {
    // Create a server - which is supposed to run in Node
    server = new Server({ port: 0, autoRun: true });
    await server.start();
    // Create a client - which is supposed to run where the tests are running
    client = new Client({
      autoConnect: false,
      url: server.url,
      tests() {
        it("tests one thing", () => {});
        it("tests another thing", () => {});
      }
    });
    
    const totalCount = new Promise<number>(resolve => {
      const runner = server.run(() => {});
      runner.once("suite", (suite) => {
        resolve(suite.total());
      });
    });
    
    await client.connect();
    expect(await totalCount).equals(2);
  });
});
