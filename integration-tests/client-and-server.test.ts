import { expect } from "chai";
import * as Mocha from "mocha";
import * as path from "path";

import { MochaRemoteClient } from "mocha-remote-client/src";
import { MochaRemoteServer } from "mocha-remote-server/src";

import { MockedMocha } from "./mocked-mocha";
import * as ob from "./output-buffering";
import { removeTimings } from "./utils";

describe("MochaRemoteClient & MochaRemoteServer", () => {
  let server: MochaRemoteServer;
  let client: MochaRemoteClient;

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
    if (server) {
      await server.stop();
    }
  });

  it("starts on 8090", async () => {
    // Create a server - which is supposed to run in Node
    server = new MochaRemoteServer();
    await server.start();
    expect(server.getUrl()).to.equal("ws://127.0.0.1:9080");
  });

  it("connects", async () => {
    // Create a server - which is supposed to run in Node
    server = new MochaRemoteServer({ port: 0 });
    await server.start();
    const serverConnection = new Promise((resolve) => {
      (server as any).wss.once("connection", () => {
        resolve();
      });
    });
    // Create a client - which is supposed to run where the tests are running
    client = new MochaRemoteClient({ url: server.getUrl() });
    // Await the client connecting and the server emitting an event
    await Promise.all([
      serverConnection,
      client.connect(),
    ]);
  });

  it("can start client from the server", async () => {
    // Create a server - which is supposed to run in Node
    server = new MochaRemoteServer({
      mochaOptions: { reporter: "base" /* to prevent output */ },
      port: 0,
    });
    await server.start();

    // Create a client - which is supposed to run where the tests are running
    client = new MochaRemoteClient({ url: server.getUrl() });
    await client.connect();
    const mocha = new MockedMocha() as Mocha;
    client.instrument(mocha);

    await new Promise((resolve) => {
      // Asking the server to start the run
      server.run((failures) => {
        expect(failures).to.equal(0);
        resolve();
      });
    });
  });

  describe("running a Mocha test suite", () => {
    const sampleTestPath = path.resolve(__dirname, "sample.test.js");

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
      "nyan",
    ].forEach((reporter) => {
      describe(`with "${reporter}" reporter`, () => {
        let regularOutput: string;
        let remoteOutput: string;

        describe("running", () => {
          let mocha: Mocha;
          beforeEach(async () => {
            // Save the current global to continue the script
            const globalBefore = Object.apply({}, global);
            // Initialize the clintside test
            mocha = new Mocha({ fullStackTrace: true });
            // Bust the cache if any
            delete require.cache[sampleTestPath];
            // Add the test file
            mocha.addFile(sampleTestPath);
            // Restore the global
            Object.apply(global, globalBefore);
          });

          // Disabling the output buffering, in case the test failed and never did this itself
          afterEach(ob.disable);

          it("completes when not instrumented", (done) => {
            // Run the mocha with the reporter
            const output = ob.enable();
            mocha.reporter(reporter);
            // Run and await completion
            mocha.run((failures) => {
              ob.disable();
              expect(failures).to.equal(1);
              regularOutput = output().toString("utf8");
              done();
            });
          });

          it("completes through the remote", async () => {
            // Run the mocha with the mocha-remote-client as reporter
            // Create a server with the reporter that we're testing with
            server = new MochaRemoteServer({ port: 0, mochaOptions: { reporter } });
            await server.start();
            // Create a client - which is supposed to run where the tests are running
            client = new MochaRemoteClient({ url: server.getUrl() });
            await client.connect();
            // Instrument the mocha instance:
            // Overrides run() and tells the client to use this when aksed to run
            client.instrument(mocha);

            // Set the reporter, run and await completion
            const output = ob.enable();
            // Run and await completion
            await new Promise((resolve) => {
              // We're asking the server to start
              server.run((failures) => {
                ob.disable();
                expect(failures).to.equal(1);
                remoteOutput = output().toString("utf8");
                resolve();
              });
            });
          });
        });

        describe("outputs", () => {
          it("is the same", () => {
            if (typeof(regularOutput) === "string" && typeof(remoteOutput) === "string") {
              // Convert the stdout buffers to strings and compare the output
              const regularOutputTimeless = removeTimings(regularOutput);
              const remoteOutputTimeless = removeTimings(remoteOutput);
              expect(remoteOutputTimeless).to.equal(regularOutputTimeless);
            } else {
              throw new Error("Cannot compare outputs if tests were not running");
            }
          });
        });
      });
    });
  });
});
