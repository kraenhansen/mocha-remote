#!/usr/bin/env node

// Monkey patches the Node.js require to intercept the call to "spawn"

const Module = require("module");
const { resolve } = require("path");

const originalRequire = Module.prototype.require;

Module.prototype.require = function() {
  const result = originalRequire.apply(this, arguments);
  if (arguments[0] === "child_process") {
    const originalSpawn = result.spawn;
    result.spawn = function() {
      const args = arguments[1];
      const options = arguments[2];
      // Override the entry point
      args[0] = resolve(__dirname, "_mocha-remote.js");
      // Call the original spawn
      return originalSpawn.apply(this, arguments);
    };
  }
  return result;
};

// Start the original mocha bin
require("mocha/bin/mocha");
