import { Client } from "mocha-remote-client";
import assert from "node:assert";
import fs from "node:fs";

new Client({
  tests({ outFile }) {
    assert(typeof outFile === "string", "Expected a 'fileToTouch' in context");
    assert(fs.existsSync(outFile) === false, `Expected '${outFile}' to not exist`);

    it("succeeds but doesn't exit", () => {});
    process.once("exit", (code) => {
      fs.writeFileSync(outFile, JSON.stringify({ code, pid: process.pid }), "utf8");
    });
  }
});

// Do a long timeout to prevent an exit
setTimeout(() => {}, 60 * 1000);
