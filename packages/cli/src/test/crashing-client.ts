import { Client } from "mocha-remote-client";

const when = process.argv[process.argv.length - 1];

new Client({
  tests: () => {
    if (when === "early") {
      process.kill(process.pid, "SIGKILL");
    }

    it("runs", () => {
      if (when === "later") {
        process.kill(process.pid, "SIGKILL");
      }
    });
  }
});
