<p align="center">
  <img src="https://github.com/kraenhansen/mocha-remote/raw/master/docs/logo.svg?sanitize=true" alt="Mocha Remote"/>
</p>

<p align="center">
  ☕️🕹 Run Mocha tests anywhere - get reporting in your terminal 🕹☕️
</p>

## Why?

I wanted to run a single Mocha test suite across multiple environments (Node.js, Electron and React-Native) with ideally no changes to the test suite.
I found running the tests inside an Electron or a React-Native app, was difficult - it was hard to control it, start / stop external services and get reporting on which tests pass or fail.

## Please Note: This is very early-stage

I would appreciate a shout-out on Twitter [@kraenhansen](https://twitter.com/kraenhansen) if you actually start using this or have suggestions on how to improve the library and its interface.

## Installing the client

Install the client in the package that will be running tests.
This will probably be an example app in a particular environment (React Native, Electron, Web app etc.) from which you want to run your tests.

```shell
npm install mocha-remote-client --save
```

Create an instance of the client and add tests.

```javascript
import { Client } from "mocha-remote-client";

// Create a client, which will automatically connect to the server on the default port (8090)
const client = new Client({
  // Called when the server asks the client to run
  tests: () => {
    // write your tests here or require a package that calls the mocha globals
    describe("my thing", () => {
      it("works", () => {
        // yay!
      });
    });
  },
});
```

By default, the client automatically (re)connects to the server and disconnects once its testing has ended.

## Installing & running the server (via the CLI)

Install the Mocha Remote CLI into your project.

```shell
npm install mocha@^8 mocha-remote-cli --save-dev
```

To start the server, simply run the Mocha Remote CLI from your terminal

```shell
npx mocha-remote
```

The CLI takes a couple of runtime parameters, run the CLI with `--help` to get an overview.

```
> npx mocha-remote --help

                         __                                       __     
   ____ ___  ____  _____/ /_  ____ _   ________  ____ ___  ____  / /____ 
  / __ `__ \/ __ \/ ___/ __ \/ __ `/  / ___/ _ \/ __ `__ \/ __ \/ __/ _ \
 / / / / / / /_/ / /__/ / / / /_/ /  / /  /  __/ / / / / / /_/ / /_/  __/
/_/ /_/ /_/\____/\___/_/ /_/\__,_/  /_/   \___/_/ /_/ /_/\____/\__/\___/ 
                                                                         
Options:
  -H, --hostname                            Network hostname to use when
                                            listening for clients
                                                            [default: "0.0.0.0"]
  -P, --port                                Network port to use when listening
                                            for clients          [default: 8090]
  -I, --id                                  Connections not matching this will
                                            be closed       [default: "default"]
  -g, --grep                                Only run tests matching this string
                                            or regexp                   [string]
  -i, --invert                              Inverts --grep matches
                                                      [boolean] [default: false]
  -w, --watch                               Keep the server running after a test
                                            has ended [boolean] [default: false]
  -c, --context                             Runtime context sent to client when
                                            starting a run (<k=v,[k1=v1,..]>)
                                                           [array] [default: []]
  -R, --reporter                            Specify reporter to use
                                                               [default: "spec"]
  -O, --reporter-option,                    Reporter-specific options
  --reporter-options                        (<k=v,[k1=v1,..]>)
                                                           [array] [default: []]
  -s, --silent                              Print less to stdout
                                                      [boolean] [default: false]
  -e, --exit-on-error                       Exit immediately if an error occurs
                                                      [boolean] [default: false]
  -v, --version                             Show version number & exit [boolean]
  -h, --help                                Show help                  [boolean]
```

The default behavior of the CLI is to listen for a client connecting, ask the client to run its tests and then exit with the number of failures as exit code, once the connected client ends the run.

### Running a sub-command

The CLI takes an optional sub-command as positional runtime argument, which will be spawned when the server has started and killed when the CLI exits. Additionally, the server will kill itself if the sub-command exits.

```shell
npx mocha-remote node ./start-client.js
```

This can be used to "wrap" a command that starts and runs the client-side of the tests (such as the React Native Metro bundler and the command to start the iOS simulator - [see the MochaRemoteExample app](https://github.com/kraenhansen/mocha-remote/tree/master/packages/integration-tests/environments/react-native/MochaRemoteExample)).

### Watch mode

If you want to iterate your test suite or implementation, use the `--watch` flag. This will ask clients to run their tests as they connect but keep the server process running until it gets interrupted (pressing <kbd>Ctrl</kbd> + <kbd>C</kbd>).

As an alternative, run with environment variable `MOCHA_REMOTE_WATCH=true` to enable watch mode by default.

### Hostname, port and id

The `--hostname` and `--port` arguments controls the TCP settings of the underlying WebSocket Server. The default `--hostname` of `0.0.0.0` makes the socket listen on all network interfaces and the default port is `8090`. Setting the port to 0 (zero) will assign the first available port, this is useful if you want to run multiple instances of the CLI / Server without having to worry about picking available ports for each.

To avoid cross-talk when running multiple clients that might potentially connect back, use an `--id` to reject connections from clients using an unexpected WebSocket protocol / id.

The connection URL, port and ID is exposed to the sub-command as environment variables:

```shell
MOCHA_REMOTE_URL=ws://0.0.0.0:8090
MOCHA_REMOTE_PORT=8090
MOCHA_REMOTE_ID=default
```

Run the CLI with environment variables `MOCHA_REMOTE_HOST`, `MOCHA_REMOTE_PORT`, `MOCHA_REMOTE_ID` to provide alternative default values.

### Context

In the case where you need your client-side tests to know information which is only available when you're running the tests, such as the URL of a backend server or secret that you don't want to embed into the client applications source-code, you can specify a `--context` (can be repeated) parameter with key=value pairs (separated by comma) which is sent to the client and exposed when tests are loaded.

```shell
npx mocha-remote --context backendUrl=http://localhost:1234 --context secret=very-secure-indeed
```

The client can now read these values of the context when loading the tests:

```typescript
new Client({
  tests: context => {
    // Construct something from the values provided by the context
    const app = new MyApp({
      backendUrl: context.backendUrl,
      secret: context.secret,
    });
    // Use that something in the tests
    describe("my app", () => {
      it("connects", async () => {
        await app.connect();
      });
    });
  }
});
```

Run with environment variable `MOCHA_REMOTE_CONTEXT=secret=very-secure-indeed` to provide a default context.

### Grep

See the "grep" section of the Mocha documentation: https://mochajs.org/#-grep-regexp-g-regexp

> Cause Mocha to only run tests matching the given regexp, which is internally compiled to a [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Regexp).

Run with environment variable `MOCHA_REMOTE_GREP=whatever` to provide a default grep expression.

### Invert

See the "invert" section of the Mocha documentation: https://mochajs.org/#-invert

> Use the inverse of the match specified by --grep

Run with environment variable `MOCHA_REMOTE_INVERT=true` to invert grep by default.

### Reporter and reporter options

See the "reporters" section of the Mocha documentation for more information on these:
 https://mochajs.org/#reporters

Run with environment variable `MOCHA_REMOTE_REPORTER=min` to provide a default reporter (in this case "min").

### Exit on error

If an error occurs client-side, while loading tests, you might want to ensure your CI job fails instead of simply reporting "0 passing". To get this behavior, run with `--exit-on-error` (or `MOCHA_REMOTE_EXIT_ON_ERROR=true`).

## Alternatively: Installing the server (for a programatic API)

Install the server in the package from where you want reporting, probably a simple JavaScript run by Node.js.

```shell
npm install mocha-remote-server --save-dev
```

Create an instance of the server, start it, start your client (somehow), run the tests remote and exit appropriately.

```javascript
// Import if the platform supports it
import { Server } from "mocha-remote-server";

// 1. Create an instance of the server
const server = new Server();

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

1. If you only need to run your tests in browsers, [the Karma test runner](https://karma-runner.github.io/) could be a good alternative to this package. If you're developing a library that must work in other JavaScript environments, such as React Native, I haven't found any other alternatives.
2. I need help to move this forward, please create an issue (or even better a PR) if you have trouble using it.
3. Not all reporters behave exactly the same on the server side as if they were running without this library. Currently the integration tests are running with "base", "dot", "doc", "spec", "list", "tap", "min" and "nyan". See [the integration tests](https://github.com/kraenhansen/mocha-remote/blob/master/packages/integration-tests/src/reporters.test.ts) for a detailed description on why and how severely other reporters are failing.

---

**Attributions for the logo:**

- Original Mocha logo by Dick DeLeon <ddeleon@decipherinc.com> and Christopher Hiller <boneskull@boneskull.com>.
- [Hand pointing](https://thenounproject.com/search/?q=pointing%20hand&i=593527) by creative outlet from the Noun Project.
- [Wireless](https://thenounproject.com/search/?q=wireless&i=21574) by Piotrek Chuchla from the Noun Project
