import { expect } from "chai";
import path from "path";

import { Client } from "mocha-remote-client";
import { Server } from "mocha-remote-server";

describe("callbacks", () => {
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

  describe("running a Mocha test suite", () => {
    const sampleTestPath = path.resolve(__dirname, "../sample.test.js");

    it("calls the callbacks and completes", async () => {
      // Create a server with the a muted reporter
      server = new Server({ reporter: "base" });

      const serverStart = new Promise(resolve => {
        server.on("started", resolve);
      });

      const serverEnd = new Promise<void>(resolve => {
        server.on("end", resolve);
      });

      await server.start();

      const serverRunCallback = new Promise<void>(resolve => {
        server.run(failures => {
          expect(failures).to.equal(1);
          resolve();
        });
      });
      
      // Create a client - which is supposed to run where the tests are running
      client = new Client({
        autoConnect: true,
        tests: () => {
          // Bust the cache if any
          delete require.cache[sampleTestPath];
          // Add the test file
          require(sampleTestPath);
        },
      });

      // Create a promise that resolves when tests finishes
      const clientRunning = new Promise(resolve => {
        client.once("end", resolve);
      });

      await Promise.all([serverStart, clientRunning, serverEnd, serverRunCallback]);
    });
  });
});
