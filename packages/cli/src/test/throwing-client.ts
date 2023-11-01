import { Client } from "mocha-remote-client";

new Client({
  tests: () => {
    throw new Error("b00m!");
  }
});
