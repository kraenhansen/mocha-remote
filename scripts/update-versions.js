const cp = require("child_process");
const { resolve } = require("path");

const { version } = require("../package.json");
// Update the cli version
cp.spawnSync("npm", [ "version", version, "--allow-same-version" ], {
  cwd: resolve(__dirname, "../packages/cli"),
  stdio: ['inherit', 'inherit', 'inherit']
});
// Update the client version
cp.spawnSync("npm", [ "version", version, "--allow-same-version" ], {
  cwd: resolve(__dirname, "../packages/client"),
  stdio: ['inherit', 'inherit', 'inherit']
});
// Update the server version
cp.spawnSync("npm", [ "version", version, "--allow-same-version" ], {
  cwd: resolve(__dirname, "../packages/server"),
  stdio: ['inherit', 'inherit', 'inherit']
});
