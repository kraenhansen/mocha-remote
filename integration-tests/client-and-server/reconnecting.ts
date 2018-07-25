import { expect } from "chai";
import * as path from "path";

import { MochaRemoteClient } from "mocha-remote-client/src";
import { MochaRemoteServer } from "mocha-remote-server/src";

import { delay } from "../utils";

describe("reconnecting client", () => {
  let server: MochaRemoteServer;
  let client: MochaRemoteClient;

  // Making the test run faster
  MochaRemoteClient.DEFAULT_CONFIG.retryDelay = 50;
  const sampleTestPath = path.resolve(__dirname, "../sample.test.js");

  afterEach(async () => {
    if (client) {
      client.disconnect();
    }
    if (server) {
      await server.stop();
    }
  });

  it("can start without a server, connect, run, fail, re-connect and re-run", async () => {
    // Create a server with the a muted reporter
    server = new MochaRemoteServer({ reporter: "base" }, { autoStart: false });

    // Create a client - which is supposed to run where the tests are running
    const clientReRunning = new Promise((resolve) => {
      let runningCounter = 0;
      client = new MochaRemoteClient({
        whenInstrumented: (mocha) => {
          delete require.cache[sampleTestPath];
          mocha.addFile(sampleTestPath);
        },
        whenRunning: (runner) => {
          if (runningCounter === 0) {
            runningCounter++;
          } else if (runningCounter === 1) {
            runningCounter++;
            // Resolve once the second round of testing has ended
            runner.once("end", () => {
              resolve();
            });
          } else {
            throw new Error(`Didn't expect the test to run ${runningCounter + 1} times`);
          }
        },
      });
    });

    // Wait for the client to start reconnecting
    await delay(MochaRemoteClient.DEFAULT_CONFIG.retryDelay * 2.1);
    // Start the server
    await server.start();

    await new Promise((resolve) => {
      server.run((failures) => {
        // expect(failures).to.equal(1);
        resolve();
      });
    });

    // Stop the server
    server.stop();
    // Wait for client to start reconnecting
    await delay(MochaRemoteClient.DEFAULT_CONFIG.retryDelay * 2.1);
    // Start the server
    await server.start();

    // Run again
    await new Promise((resolve) => {
      server.run((failures) => {
        // expect(failures).to.equal(1);
        resolve();
      });
    });

    await clientReRunning;
  });
});
