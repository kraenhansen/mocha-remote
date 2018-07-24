import { expect } from "chai";
import * as path from "path";

import { MochaRemoteClient } from "mocha-remote-client/src";
import { MochaRemoteServer } from "mocha-remote-server/src";

describe("callbacks", () => {
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

  describe("running a Mocha test suite", () => {
    const sampleTestPath = path.resolve(__dirname, "../sample.test.js");

    it("calls the callbacks and completes", async () => {
      // Create a server with the a muted reporter
      const serverStart = new Promise((resolve) => {
        server = new MochaRemoteServer({
          reporter: "base",
        }, {
          autoStart: true,
          callbacks: {
            serverStarted: resolve,
          },
        });
      });

      // Create a promise that resolves when tests finishes
      const clientRunning = new Promise((resolve) => {
        // Create a client - which is supposed to run where the tests are running
        client = new MochaRemoteClient({
          whenInstrumented: (mocha) => {
            // Bust the cache if any
            delete require.cache[sampleTestPath];
            // Add the test file
            mocha.addFile(sampleTestPath);
          },
          whenRunning: (runner) => {
            runner.once("end", resolve);
          },
        });
      });

      const serverCompleted = new Promise((resolve) => {
        server.run((failures) => {
          expect(failures).to.equal(1);
          resolve();
        });
      });

      return Promise.all([ serverStart, clientRunning, serverCompleted ]);
    });
  });
});
