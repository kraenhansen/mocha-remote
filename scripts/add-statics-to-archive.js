const fs = require("fs");
const os = require("os");
const { resolve } = require("path");
const cp = require("child_process");

const packageDir = process.cwd();
const archiveFiles = fs.readdirSync(packageDir).filter(path => path.indexOf(".tgz") !== -1);
if (archiveFiles.length !== 1) {
  console.error(`Expected a single .tgz file in ${packageDir}`);
  process.exit(1);
}
const zippedArchivePath = resolve(packageDir, archiveFiles[0]);
const archivePath = zippedArchivePath.replace(/\.tgz/, ".tar");

const tempPrefix = resolve(os.tmpdir(), "mocha-remote-");
const tempPath = fs.mkdtempSync(tempPrefix);

// Gunzip the module
cp.spawnSync("gunzip", [ zippedArchivePath ], { stdio: 'inherit' });
// Append the README.md
cp.spawnSync("tar", [
  "-u",
  "-f",
  archivePath,
  "README.md",
  "docs"
], {
  cwd: resolve(__dirname, ".."),
  stdio: 'inherit',
});
// Gzip the module again
cp.spawnSync("gzip", [ archivePath ], { stdio: 'inherit' });
// Move the gzipped output onto the original zipped archives path
cp.spawnSync("mv", [ `${archivePath}.gz`, zippedArchivePath ], { stdio: 'inherit' });
