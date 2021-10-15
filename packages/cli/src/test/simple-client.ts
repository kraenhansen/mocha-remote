import { Client } from "mocha-remote-client";

new Client({
  tests: context => {
    it("tests something", async () => {
      if (context.failure) {
        throw new Error(context.failure as string);
      }
      if (context.wait) {
        await new Promise(resolve => setTimeout(resolve, context.wait as number));
      }
    });
  }
});
