import os from "node:os";
import { globSync } from "glob";
import { Client } from "mocha-remote-client";

/* eslint-disable no-console */

// TODO: Add support for existing Mocha runtime options for "file handling"

/*
 * File Handling
 *       --extension          File extension(s) to load
 *                                            [array] [default: ["js","cjs","mjs"]]
 *       --file               Specify file(s) to be loaded prior to root suite
 *                            execution                   [array] [default: (none)]
 *       --ignore, --exclude  Ignore file(s) or glob pattern(s)
 *                                                        [array] [default: (none)]
 *       --recursive          Look for tests in subdirectories            [boolean]
 *   -r, --require            Require module              [array] [default: (none)]
 *   -S, --sort               Sort test files                             [boolean]
 *   -w, --watch              Watch files in the current working directory for
 *                            changes                                     [boolean]
 *       --watch-files        List of paths or globs to watch               [array]
 *       --watch-ignore       List of paths or globs to exclude from watching
 *                                       [array] [default: ["node_modules",".git"]]
 */

interface ConnectionRefusedError extends AggregateError {
  errors: { code: "ECONNREFUSED", address: string, port: number }[];
}

function isConnectionRefusedError(error: unknown): error is ConnectionRefusedError {
  return error instanceof AggregateError && error.errors.every((error: unknown) => {
    return error instanceof Error &&
      "code" in error && error.code === "ECONNREFUSED" &&
      "port" in error && typeof error.port === "number";
  });
}

const client = new Client({
  title: `Node.js v${process.versions.node} on ${os.platform()}`,
  autoConnect: false,
  autoReconnect: false,
  async tests(context) {
    Object.assign(global, {
      environment: { ...context, node: true },
    });
    // TODO: Is there a more reliable way to get the interpreter and command skipped?
    const [, , patterns] = process.argv;
    const testPaths = globSync(patterns, { absolute: true });
    for (const testPath of testPaths) {
      await import(testPath);
    }
  },
});

try {
  await client.connect();
} catch (error) {
  process.exitCode = 1;
  if (isConnectionRefusedError(error)) {
    const attempts = error.errors.map(error => `${error.address}:${error.port}`);
    const command = "npx mocha-remote -- mocha-remote-node src/*.test.ts";
    const suggestion = "Are you wrapping the mocha-remote-node CLI with the mocha-remote?";
    console.error(`Connection refused (tried ${attempts.join(" / ")}).\n${suggestion}\n${command}`);
  } else if (error instanceof Error) {
    console.error("Mocha Remote Client failed:", error.stack);
  } else {
    console.error("Mocha Remote Client failed:", error);
  }
 }
