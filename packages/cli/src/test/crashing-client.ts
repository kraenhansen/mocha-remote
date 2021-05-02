import { Client } from "mocha-remote-client";
import { causeSegfault } from "segfault-handler";

const when = process.argv[process.argv.length - 1];

new Client({
  tests: () => {
    if (when === "early") {
      causeSegfault();
    }

    it("runs", () => {
      if (when === "later") {
        causeSegfault();
      }
    });
  }
});
