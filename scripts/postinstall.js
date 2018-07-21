const { resolve } = require("path");

const parentPath = resolve(__dirname, '../..');

if (/node_modules$/.test(parentPath)) {
  console.error("Time for a ☕️ break? The mocha-remote client and server should be installed separately.");
  process.exit(1);
}
