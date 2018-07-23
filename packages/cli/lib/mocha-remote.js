#!/usr/bin/env node

// Monkey patches the Node.js require to intercept the call to "spawn"

const Module = require("module");
const { existsSync } = require("fs");
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
try {
  // Check if a local version of the mocha bin exists (when installed as a peer dependency)
  const localMochaPath = resolve(process.cwd(), "node_modules/mocha/bin/mocha");
  if (existsSync(localMochaPath)) {
    require(localMochaPath);
  } else {
    require("mocha/bin/mocha");
  }
} catch (err) {
  if (err.message === "Cannot find module 'mocha/bin/mocha'") {
    console.error("💥 Run `npm install mocha --save-dev` to install mocha before calling mocha-remote");
  } else {
    console.error(err.stack);
  }
  process.exit(1);
}
