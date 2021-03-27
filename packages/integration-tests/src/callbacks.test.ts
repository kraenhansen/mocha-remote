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
      const serverStart = new Promise(resolve => {
        server = new Server({
          reporter: "base",
          autoStart: true,
        }).on("started", resolve);
      });

      // Create a promise that resolves when tests finishes
      const clientRunning = new Promise(resolve => {
        // Create a client - which is supposed to run where the tests are running
        client = new Client({
          tests: () => {
            // Bust the cache if any
            delete require.cache[sampleTestPath];
            // Add the test file
            require(sampleTestPath);
          },
        });
        client.once("end", resolve);
      });

      const serverCompleted = new Promise<void>(resolve => {
        server.run(failures => {
          expect(failures).to.equal(1);
          resolve();
        });
      });

      return Promise.all([serverStart, clientRunning, serverCompleted]);
    });
  });
});
