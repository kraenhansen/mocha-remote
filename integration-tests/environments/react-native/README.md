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

Install Mocha, the mocha-remote-client and `node-libs-react-native` as a dependencies of your react native project

```
npm install mocha mocha-remote-client node-libs-react-native --save
```

Follow the instructions on https://github.com/parshap/node-libs-react-native#usage-with-react-native-packager to get the
node shims for react native properly installed - with an extra shim for fs:

> Add a rn-cli.config.js file in the root directory of your React Native project and set extraNodeModules:
>
> ```
> // rn-cli.config.js
> const extraNodeModules = require('node-libs-react-native');
> extraNodeModules.fs = require.resolve("mocha-remote-client/entries/react-native/fs");
> module.exports = {
>   extraNodeModules,
> };
> ```

Import `Mocha` and the `MochaRemoteClient` into the app

```
import { MochaRemoteClient } from "mocha-remote-client";
// Importing the node.js version of Mocha to prevent polluting the global - this must happen after importing the client.
import Mocha from "mocha/lib/mocha";
```

Then create an instance of Mocha, require in any tests, create a mocha remote client and use that to instrument the
mocha instance.

```
// 1. Create an instance of Mocha
const mocha = new Mocha();
// Set the title of the root suite
mocha.suite.title = `React-Native on ${Platform.OS}`;

// 2. Require any tests
require("./test/simple.test.js");

// 3. Create a client and instrument the mocha instance
const client = new MochaRemoteClient();
client.instrument(mocha);
```

The client automatically connects to the Mocha remote server on its default port which starts running the tests.

## Specifically for Android

You might need to bind the localhost default port on the Android device with your local machine, running

    adb reverse tcp:8090 tcp:8090
