import { Client } from "mocha-remote-client";

new Client({
  tests: context => {
    it("tests something", () => {
      if (context.failure) {
        throw new Error(context.failure as string);
      }
    });
  }
});
