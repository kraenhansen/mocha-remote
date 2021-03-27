import { expect } from "chai";
import Mocha from "mocha";
import path from "path";

import { Client } from "mocha-remote-client";
import { Server } from "mocha-remote-server";

import { ob, removeTimings } from "./utils";

describe.skip("reporters", () => {
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

    /*
     * dot - dot matrix
     * doc - html documentation
     * spec - hierarchical spec list
     * json - single json object
     * progress - progress bar
     * list - spec-style listing
     * tap - test-anything-protocol
     * landing - unicode landing strip
     * xunit - xunit reporter
     * min - minimal reporter (great with --watch)
     * json-stream - newline delimited json events
     * markdown - markdown documentation (github flavour)
     * nyan - nyan cat!
     */
    [
      "base",
      "dot",
      // "doc", // Has an issue printing the error
      "spec",
      // "json", // Has an issue printing the error and start, end, duration are non-deterministic
      // "progress", // Non-deterministic output, but has been visually / manually confirmed
      "list",
      // "tap", // Throws an Uncaught TypeError: runner.grepTotal is not a function
      // "landing", // Non-deterministic output, but has been visually / manually confirmed
      // "xunit", // Non-deterministic timestamp and time attributes
      "min",
      // "json-stream", // Missing ",{"total":3}" printing a start event & non-deterministic start, end and duration
      // "markdown", // Throws an Error: Cannot send fail WebSocket is closed
      "nyan"
    ].forEach(reporter => {
      describe(`with "${reporter}" reporter`, () => {
        let regularOutput: string;
        let remoteOutput: string;

        describe("running", () => {
          let mocha: Mocha;
          beforeEach(async () => {
            // Save the current global to continue the script
            const globalBefore = Object.assign({}, global);
            // Initialize the clintside test
            mocha = new Mocha({ fullStackTrace: true });
            // Bust the cache if any
            delete require.cache[sampleTestPath];
            // Add the test file
            mocha.addFile(sampleTestPath);
            // Restore the global
            Object.assign(global, globalBefore);
          });

          // Disabling the output buffering, in case the test failed and never did this itself
          afterEach(ob.disable);

          it("completes when not instrumented", done => {
            // Run the mocha with the reporter
            const output = ob.enable();
            mocha.reporter(reporter);
            // Run and await completion
            mocha.run(failures => {
              regularOutput = output().toString("utf8");
              expect(failures).to.equal(1);
              done();
            });
          });

          it("completes through the remote", async () => {
            // Run the mocha with the mocha-remote-client as reporter
            // Create a server with the reporter that we're testing with
            server = new Server({ port: 0, reporter });
            await server.start();
            // Create a client - which is supposed to run where the tests are running
            client = new Client({ url: server.getUrl() });

            // Set the reporter, run and await completion
            const output = ob.enable();
            // Run and await completion
            await new Promise<void>(resolve => {
              // We're asking the server to start
              server.run(failures => {
                remoteOutput = output().toString("utf8");
                expect(failures).to.equal(1);
                resolve();
              });
            });
          });
        });

        describe("outputs", () => {
          it("is the same", () => {
            if (
              typeof regularOutput === "string" &&
              typeof remoteOutput === "string"
            ) {
              // Convert the stdout buffers to strings and compare the output
              const regularOutputTimeless = removeTimings(regularOutput);
              const remoteOutputTimeless = removeTimings(remoteOutput);
              expect(remoteOutputTimeless).to.equal(regularOutputTimeless);
            } else {
              throw new Error(
                "Cannot compare outputs if tests were not running"
              );
            }
          });
        });
      });
    });
  });
});
