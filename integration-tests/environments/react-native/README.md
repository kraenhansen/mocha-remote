# React Native + Mocha Remote

Running your mocha tests within an actual Android or iOS device. This is valuable if you're building a library that
might behave differently when running in the device than when running in Node.js on a developers machine.

## Setup instructions

First install the react-native command-line interface - if you don't already have that.

```
npm install react-native-cli -g
```

Then initialize a new React Native project

```
react-native init MyTestApplication
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

Then create an instance of Mocha, require in any tests, create a mocha remote client and use that to instrument the
mocha instance.

```
// 1. Create an instance of Mocha
const mocha = new MochaRemoteClient.Mocha();
// Set the title of the root suite
mocha.suite.title = `React-Native on ${Platform.OS}`;

// 2. Prepare the global object and require tests
// The next line is needed because we're by-passing mocha.addFile
mocha.suite.emit("pre-require", global, null, mocha);
require("./test/simple.test.js");

// 3. Create a client and instrument the mocha instance
const client = new MochaRemoteClient();
client.instrument(mocha);
```

The client automatically connects to the Mocha remote server on its default port which starts running the tests.

## Setting up the server

First install mocha and the mocha-remote-cli.

```
npm install mocha mocha-remote-cli --save
```

## Specifically for Android

You might need to bind the localhost default port on the Android device with your local machine, running

    adb reverse tcp:8090 tcp:8090
