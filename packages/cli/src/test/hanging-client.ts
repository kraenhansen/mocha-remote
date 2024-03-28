import { Client } from "mocha-remote-client";

import assert from "node:assert";
import fs from "node:fs";

new Client({
  tests({ outFile, endlessLoop }) {
    assert(typeof outFile === "string", "Expected a 'outFile' in context");
    assert(fs.existsSync(outFile) === false, `Expected '${outFile}' to not exist`);
    fs.writeFileSync(outFile, JSON.stringify({ pid: process.pid }), "utf8");

    if (endlessLoop) {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // Useful to simulate a process that cannot be exited gracefully
      }
    }

    // Write to a file once the process exits, for the test to get the status code and pid
    process.once("exit", (code) => {
      fs.writeFileSync(outFile, JSON.stringify({ code, pid: process.pid }), "utf8");
    });

    it("succeeds but doesn't exit", () => {});
  }
});

// Do a long timeout to prevent an exit
setTimeout(() => {}, 60 * 1000);
