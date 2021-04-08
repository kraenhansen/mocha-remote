import { Client } from "mocha-remote-client";

new Client({
  tests: context => {
    /* eslint-disable-next-line no-console */
    console.log(JSON.stringify(context));
  }
});
