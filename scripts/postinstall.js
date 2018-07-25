const { resolve } = require("path");

// This script should be run after a user accidentally installs the root package

const parentPath = resolve(__dirname, '../..');

if (/node_modules$/.test(parentPath)) {
  console.error("Time for a ☕️ break? Mocha Remote is split into multiple packages:");
  console.error(" • `mocha-remote-cli` The drop-in enhancement of the Mocha cli, which runs the server.");
  console.error(" • `mocha-remote-client` The client you should initialize in the environment you're testing in.");
  console.error(" • `mocha-remote-server` The server, if you need to access it programmatically.");
  process.exit(1);
}
