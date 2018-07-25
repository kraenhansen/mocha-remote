const { expect } = require("chai");
const cp = require("child_process");
const { resolve } = require("path");
const Mocha = require("mocha");
const { MochaRemoteClient } = require("mocha-remote-client");

const CLI_PATH = resolve(__dirname, "../lib/mocha-remote.js");
const SAMPLE_TEST_PATH = resolve(__dirname, "../../../integration-tests/sample.test.js");

describe("mocha-remote-cli", () => {
  it("can run and print --help", (done) => {
    let output = "";
    const cli = cp.spawn(CLI_PATH, [ "--help" ]);
    cli.stdout.on("data", (data) => {
      output += data.toString();
    });
    cli.on("close", (code) => {
      if (code !== 0) {
        const err = new Error(`Mocha cli closed unexpectedly (code = ${code})`);
        done(err);
      } else {
        expect(output).to.contain("Usage: mocha [debug] [options] [files]");
        done();
      }
    });
  });

  describe("running a simple test", () => {
    let cli;
    let client;
    let mocha;

    beforeEach(() => {
      client = new MochaRemoteClient();
      // Save the current global to continue the script
      const globalBefore = Object.apply({}, global);
      // Initialize the clintside test
      mocha = new Mocha({ fullStackTrace: true });
      // Bust the cache if any
      delete require.cache[SAMPLE_TEST_PATH];
      // Add the test file
      mocha.addFile(SAMPLE_TEST_PATH);
      // Restore the global
      Object.apply(global, globalBefore);
      // Instrument the mocha instance
      client.instrument(mocha);
    });

    afterEach(() => {
      // Kill the process if its still running
      if (cli) {
        cli.kill("SIGINT");
      }
      if (client) {
        client.disconnect();
      }
    });

    it("can output the result", (done) => {
      let output = "";
      cli = cp.spawn(CLI_PATH, [ SAMPLE_TEST_PATH ]);
      // When the cli gives output, read it out ...
      cli.stdout.on("data", (data) => {
        output += data.toString();
      });
      // When the process closes, examine the output
      cli.on("close", (code) => {
        if (code === 1) {
          expect(output).to.contain("1 passing");
          expect(output).to.contain("1 pending");
          expect(output).to.contain("1 failing");
          done();
        } else {
          console.log(output);
          const err = new Error(`Mocha cli closed unexpectedly (code = ${code})`);
          done(err);
        }
      });
    });

  });
});
