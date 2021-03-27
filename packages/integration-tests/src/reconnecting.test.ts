import { expect } from "chai";
import path from "path";

import { Client } from "mocha-remote-client";
import { Server } from "mocha-remote-server";

import { delay } from "./utils";

describe.skip("reconnecting client", () => {
  let server: Server;
  let client: Client;

  // Making the test run faster
  Client.DEFAULT_CONFIG.reconnectDelay = 50;
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
    server = new Server({ reporter: "base", autoStart: false });

    // Create a client - which is supposed to run where the tests are running
    const clientReRunning = new Promise<void>(resolve => {
      let runningCounter = 0;
      client = new Client({
        tests: () => {
          delete require.cache[sampleTestPath];
          require(sampleTestPath);
        },
      });
      client.on("running", runner => {
        if (runningCounter === 0) {
          runningCounter++;
        } else if (runningCounter === 1) {
          runningCounter++;
          // Resolve once the second round of testing has ended
          runner.once("end", () => {
            resolve();
          });
        } else {
          throw new Error(
            `Didn't expect the test to run ${runningCounter + 1} times`
          );
        }
      })
    });

    // Wait for the client to start reconnecting
    await delay(Client.DEFAULT_CONFIG.reconnectDelay * 2.1);
    // Start the server
    await server.start();

    await new Promise<void>(resolve => {
      server.run(failures => {
        expect(failures).to.equal(1);
        resolve();
      });
    });

    // Stop the server
    server.stop();
    // Wait for client to start reconnecting
    await delay(Client.DEFAULT_CONFIG.reconnectDelay * 2.1);
    // Start the server
    await server.start();

    // Run again
    await new Promise<void>(resolve => {
      server.run(failures => {
        expect(failures).to.equal(1);
        resolve();
      });
    });

    await clientReRunning;
  });
});
