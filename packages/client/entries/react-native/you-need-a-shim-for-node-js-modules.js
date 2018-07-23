// This file requires in the "node-libs-react-native" and "browser-stdout" that allows mocha to run in React Native.
// The file has a strange name to help anyone using this library to install it properly.

// TODO: This could be moved to a separate package with an explicit dependency on the module
// @see https://www.npmjs.com/package/node-libs-react-native#globals
require("node-libs-react-native/globals");

// Do as Mocha does for the browser and load a shim for the process.stdout
// @see https://github.com/mochajs/mocha/blob/master/browser-entry.js#L10
global.process.stdout = require('browser-stdout')({ level: false });

if (!global.process || !global.Buffer) {
  console.error("Missing some node globals - please load shims for these");
}
