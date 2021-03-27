import { Client } from "mocha-remote-client";

const client = new Client({
  url: process.env.MOCHA_REMOTE_URL,
  tests: () => {
    it("succeeds");
  }
});

client.once("connect", () => {
  process.exit(0);
});
