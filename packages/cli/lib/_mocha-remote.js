#!/usr/bin/env node

// Monkey patches the Node.js require to intercept the call to "spawn"

const Module = require("module");
const { MochaRemoteServer } = require("mocha-remote-server");

const DEFAULT_CLIENT_TIMEOUT = 30000;

const CLIENT_TIMEOUT = parseInt(process.env.MOCHA_REMOTE_CLIENT_TIMEOUT || DEFAULT_CLIENT_TIMEOUT, 10);
let clientTimeout = null;
function triggerClientTimeout() {
  console.error(`Exiting: Expected a connection from a client within ${CLIENT_TIMEOUT}ms`);
  console.debug("Set environment MOCHA_REMOTE_CLIENT_TIMEOUT to change this timeout (0 = disabled)");
  process.exit(1);
}

// Override the called when waiting for a client
MochaRemoteServer.DEFAULT_CONFIG = {
  // Start with the current defaults
  ...MochaRemoteServer.DEFAULT_CONFIG,
  // Override callbacks
  callbacks: {
    serverStarted: (server) => {
      console.log(`Mocha Remote server is waiting for a client on ${server.getUrl()}`);
      // If a client timeout is set - trigger it appropriately
      if (CLIENT_TIMEOUT) {
        clientTimeout = setTimeout(triggerClientTimeout, CLIENT_TIMEOUT)
      }
      // Clear the client timeout and stop the server when process gets interrupted
      process.on('SIGINT', () => {
        // Clear the client timeout
        if (clientTimeout) {
          clearTimeout(clientTimeout);
        }
        // Stop the server
        server.stop(() => {
          // This log will most probably never reach the user ...
          console.log("Mocha Remote server was stoppped");
        }, (err) => {
          console.error(`Failed when stopping Mocha Remote server: ${err.stack}`);
        });
      });
    },
    serverFailed: (server, err) => {
      if (err && err.message && err.message.indexOf("EADDRINUSE") >= 0) {
        console.error(`Mocha Remote server failed to start - is it already running?`);
        process.exit(1);
      } else {
        console.error(`Server failed to start: ${err.message}`);
      }
    },
    clientConnection: (client) => {
      console.log(`Mocha Remote client connected ...`);
      if (clientTimeout) {
        clearTimeout(clientTimeout);
      }
    }
  },
  // Tell the server to stop after test completion
  // TODO: Don't do this if we're watching
  stopAfterCompletion: true,
};


const originalRequire = Module.prototype.require;

Module.prototype.require = function() {
  const [ id ] = arguments;
  if (id === "../") { // This is _mocha requireing mocha
    // Remove the monkey patch
    Module.prototype.require = originalRequire;
    // Return the mocha-remote-server;
    return MochaRemoteServer;
  }
  return originalRequire.apply(this, arguments);
};

// Start the original _mocha bin
require("mocha/bin/_mocha");
