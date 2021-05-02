// This script starts another sub-process but doesn't exit when the sub-process does.

import cp from "child_process";

const [timeout, command, ...args] = process.argv.slice(2);

const subProcess = cp.spawn(command, args, { stdio: "inherit" });
subProcess.on("exit", (code, signal) => {
  // eslint-disable-next-line no-console
  console.log(`Subprocess exitted (${code} / ${signal})`);
})

process.on("exit", () => {
  subProcess.kill();
});

process.on("SIGINT", () => {
  subProcess.kill("SIGINT");
});

// Using a timeout to prevent process from exitting
setTimeout(() => { /* tumbleweed */}, parseInt(timeout, 10));
