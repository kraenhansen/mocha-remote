import { Client } from "mocha-remote-client";

async function connectAndRun(i: number) {
  const client = new Client({
    title: `Running client #${i}`,
    tests: () => {
      it("tests something", () => {
        // And it succeeds
      });
    }
  });
  // Await the client to end testing ...
  await new Promise(resolve => client.on("end", resolve));
}

async function run(n: number, delay: number) {
  for (let i = 0; i < n; i++) {
    await connectAndRun(i);
    // wait a second
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/* eslint-disable-next-line no-console */
run(3, 100).catch(console.error);
