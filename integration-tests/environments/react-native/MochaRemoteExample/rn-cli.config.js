const extraNodeModules = require('node-libs-react-native');
extraNodeModules.fs = require.resolve("mocha-remote-client/entries/react-native/fs");
module.exports = { extraNodeModules };
