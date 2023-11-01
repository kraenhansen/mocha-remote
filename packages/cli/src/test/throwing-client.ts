import { Client } from "mocha-remote-client";

new Client({
  tests: () => {
    throw new Error("b00m!");
  }
}).on("error", err => {
  // eslint-disable-next-line no-console
  console.log(`An error occurred: ${err.message}`);
  process.exit();
});
