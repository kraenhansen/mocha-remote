# React Native + Mocha Remote

Running your mocha tests within an actual Android or iOS device. This is valuable if you're building a library that
might behave differently when running in the device than when running in Node.js on a developers machine.

## Setup instructions

Initialize a new React Native project

```
npx react-native init MyTestApplication
```

Install Mocha, the mocha-remote-client a dependencies of your react native project

```
npm install mocha-remote-client --save
```

Import the `MochaRemoteClient` into the app.
This ships with Mocha in its react-native bundle.

```
import { MochaRemoteClient } from "mocha-remote-client";
```

Then create a mocha remote client - when the server asks the client to create a new Mocha instance the
`whenInstrumented` callback provided in the config will be called. Setup the globals and require the tests there.

```
const client = new MochaRemoteClient({
  whenInstrumented: (mocha) => {
    // Set the title of the root suite
    mocha.suite.title = `React-Native on ${Platform.OS}`;
    // This will setup the mocha globals (describe, it, etc.)
    mocha.suite.emit("pre-require", global, null, mocha);
    // Require tests
    require("./test/simple.test.js");
  },
  whenRunning: (runner) => {
    console.log("Server started the tests ...");
  },
});
```

The client automatically connects to the Mocha remote server on its default port (8090) and starts running the tests.

## Setting up the server

First install mocha and the mocha-remote-cli.

```
npm install mocha mocha-remote-cli --save
```

## Specifically for Android

You might need to bind the localhost default port on the Android device with your local machine, running

    adb reverse tcp:8090 tcp:8090
