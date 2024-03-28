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

    it("succeeds but doesn't exit", () => {});
  }
});

// Do a long timeout to prevent an exit
setTimeout(() => {}, 60 * 1000);
