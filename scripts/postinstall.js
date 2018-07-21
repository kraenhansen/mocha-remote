const { resolve } = require("path");

// This script should be run after a user accidentally installs the root package

const parentPath = resolve(__dirname, '../..');

if (/node_modules$/.test(parentPath)) {
  console.error("Time for a ☕️ break? The mocha-remote client and server should be installed separately.");
  process.exit(1);
}
