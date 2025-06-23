import { Client } from "mocha-remote-client";

import assert from "node:assert";
import fs from "node:fs";

new Client({
  tests({ outFile, endlessLoop, delay = 0 }) {
    assert(typeof outFile === "string", "Expected a 'outFile' in context");
    assert(
      fs.existsSync(outFile) === false,
      `Expected '${outFile}' to not exist`
    );
    assert(
      typeof delay === "number",
      "Expected 'delay' in context to be a number"
    );

    fs.writeFileSync(outFile, JSON.stringify({ pid: process.pid }), "utf8");

    if (endlessLoop) {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // Useful to simulate a process that cannot be exited gracefully
      }
    }

    it("succeeds but doesn't exit", async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
    });
  },
});

// Do a long timeout to prevent an exit
setTimeout(() => {}, 60 * 1000);
