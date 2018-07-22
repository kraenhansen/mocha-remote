<p align="center">
  <img src="https://github.com/kraenhansen/mocha-remote/raw/master/docs/logo.svg?sanitize=true" alt="Mocha Remote"/>
</p>

<p align="center">
  ☕️🕹 Run Mocha tests somewhere - get reporting elsewhere 🕹☕️
</p>

## Why?

I wanted to run a single Mocha test suite across multiple environments (Node.js, Electron and React-Native) with ideally
no changes to the test suite. I found that running the Mocha tests inside the Electron on React-Native apps, it was
difficult to control it, start / stop external services and get reporting on which tests pass or fail.

## Please Note: This is very early-stage

I just created this - I would appreciate a shout out on Twitter @kraenhansen if you actually start using this or have
suggestions on how to improve the library and its interface.

## Installing the client

Install the client in the package that will be running tests.
This will probably be an example app in a particular environment from which you want to run your tests.

```
npm install mocha-remote-client --save
```

Create an instance of the client, instrument an instance of Mocha and connect to the server:

```
// Import if the platform supports it
import { MochaRemoteClient } from "mocha-remote-client";
// Alternatively use a CommonJS require (you need just one of these lines 🤓)
const { MochaRemoteClient } = require("mocha-remote-client");

// 1. Create an instance of the client
const client = new MochaRemoteClient();

// 2. Create an instance of Mocha and instrument it
const mocha = new Mocha();
client.instrument(mocha);

// Add your test files
mocha.addFile("./test.js");

// 3. Ask the client to connect
client.connect(() => {
  console.log("Connected! Waiting for the server to start the test ...");
});
```

## Installing the server

Install the server in the package from where you want reporting, probably a simple JavaScript run by Node.js.

```
npm install mocha-remote-server --save-dev
```

Create an instance of the server, start it, start your client (somehow), run the tests remote and exit appropriately.

```
// Import if the platform supports it
import { MochaRemoteServer } from "mocha-remote-server";
// Alternatively use a CommonJS require (you need just one of these lines 🤓)
const { MochaRemoteServer } = require("mocha-remote-server");

// 1. Create an instance of the server
const server = new MochaRemoteServer();
// 2. Start the server
server.start().then(() => {
  console.log(`Mocha Remote server is listening on ${server.getUrl()}`);

  // 3. Do whatever you need to start the client ...

  // 4. Ask the server to run the remote tests
  server.run((failures) => {
    // 5. Optionally kill the server process with an appropriate status code
    process.exit(failures > 0 ? 1 : 0);
  });
}, (err) => {
  console.error(`Failed to start the server: ${err.stack}`);
  process.exit(1);
});
```

## Acknowledgements

1. This is still very early stage - the API may very well change into something more usable.
2. I need help to move this forward, please create an issue (or even better a PR) if you have trouble using it.
3. The server could easily be wrapped into a mocha compatible cli - that would be awesome.
4. Not all reporters behave exactly the same on the server side as if they were running without this library. Currently
   the integration tests are running with "base", "dot", "spec", "list", "min" and "nyan".
   See [the integration tests](https://github.com/kraenhansen/mocha-remote/blob/master/integration-tests/client-and-server.test.ts#L101-L114)
   for a detailed description on why and how severely other reporters are failing.

---

**Attributions for the logo:**

- Original Mocha logo by Dick DeLeon <ddeleon@decipherinc.com> and Christopher Hiller <boneskull@boneskull.com>.
- [Hand pointing](https://thenounproject.com/search/?q=pointing%20hand&i=593527) by creative outlet from the Noun Project.
- [Wireless](https://thenounproject.com/search/?q=wireless&i=21574) by Piotrek Chuchla from the Noun Project
