import cp from "node:child_process";
import { URL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { expect } from "chai";
import { it } from "mocha";

const cliPath = new URL("./cli.ts", import.meta.url).pathname;

function cli(...args: string[]) {
  return cp.spawnSync(
    process.execPath,
    ["--import", "tsx", cliPath, ...args],
    { encoding: 'utf8', env: { ...process.env, FORCE_COLOR: "false" }, timeout: 4_000 },
  );
}

function spawnCli(...args: string[]) {
  return cp.spawn(
    process.execPath,
    ["--import", "tsx", cliPath, ...args],
    { env: { ...process.env, FORCE_COLOR: "false" }, timeout: 4_000 },
  );
}

function parseJsonOutput(output: string) {
  const jsonStart = output.indexOf("{");
  const jsonEnd = output.lastIndexOf("}");
  return JSON.parse(output.slice(jsonStart, jsonEnd + 1));
}

function waitForFile(filePath: string) {
  return new Promise<string>(resolve => {
    const listener = (stats: fs.Stats) => {
      if (stats.isFile()) {
        // Stop listening for changes
        fs.unwatchFile(filePath, listener);
        resolve(fs.readFileSync(filePath, "utf8"));
      }
    };
    fs.watchFile(filePath, { interval: 10 }, listener);
  });
}

describe("Mocha Remote CLI", () => {
  it("prints --help", () => {
    const output = cli("--help");
    expect(output.stdout).contains("Show version number & exit");
  });

  it("run the command after -- and propagates exit status code", () => {
    const output = cli("--port", "0", "--", "node", "--eval", "\"console.log('hello!');process.exit(13);\"");
    expect(output.stdout).contains("hello!");
    expect(output.status).equals(13, "expected signal to propagate");
  });

  it("expose url, port and id as environment variables", () => {
    const output = cli("--port", "0", "--", "node", "--print", "\"JSON.stringify(process.env)\"");
    const jsonOuput = parseJsonOutput(output.stdout);
    expect(jsonOuput).include.keys("MOCHA_REMOTE_URL", "MOCHA_REMOTE_ID");
    const MOCHA_REMOTE_URL: string = jsonOuput.MOCHA_REMOTE_URL;
    const MOCHA_REMOTE_PORT: string = jsonOuput.MOCHA_REMOTE_PORT;
    const MOCHA_REMOTE_ID: string = jsonOuput.MOCHA_REMOTE_ID;
    expect(MOCHA_REMOTE_URL.startsWith("ws://0.0.0.0"));
    expect(Number.isInteger(MOCHA_REMOTE_PORT), "expected an integer port");
    expect(MOCHA_REMOTE_ID).equals("default");
  });

  describe("context", () => {

    it("propagates to client", () => {
      // Supports multiple --context / -c runtime flags and multiple pairs in each
      // Using --silent to parse output of the command in isolation
      const output = cli("--port", "0", "--silent", "--context", "k1=v1,k2=v2", "-c", "k3=v3,truthy", "--", "tsx", "src/test/context-logging-client.ts");
      const jsonOuput = parseJsonOutput(output.stdout);
      expect(jsonOuput).deep.equals({ k1: "v1", k2: "v2", k3: "v3", truthy: true });
    });

    it("coerce numbers", () => {
      // Supports multiple --context / -c runtime flags and multiple pairs in each
      // Using --silent to parse output of the command in isolation
      const output = cli("--port", "0", "--silent", "--context", "a=123,b=-123", "--", "tsx", "src/test/context-logging-client.ts");
      const jsonOuput = parseJsonOutput(output.stdout);
      expect(jsonOuput).deep.equals({ a: 123, b: -123 });
    });

    it("coerce booleans", () => {
      // Supports multiple --context / -c runtime flags and multiple pairs in each
      // Using --silent to parse output of the command in isolation
      const output = cli("--port", "0", "--silent", "--context", "key1=true,key2=false", "--", "tsx", "src/test/context-logging-client.ts");
      const jsonOuput = parseJsonOutput(output.stdout);
      expect(jsonOuput).deep.equals({ key1: true, key2: false });
    });
  });

  it("prints when client connects", () => {
    const output = cli("--port", "0", "--", "tsx", "src/test/simple-client.ts");
    expect(output.stdout).contains("CONNECTION from 127.0.0.1");
  });

  it("greps tests", () => {
    const output = cli("--port", "0", "--grep", "not matching", "--", "tsx", "src/test/simple-client.ts");
    expect(output.stdout).contains("0 passing");
    expect(output.status).equals(0);
  });

  it("greps tests inverted", () => {
    const output = cli("--port", "0", "--grep", "not matching", "--invert", "--", "tsx", "src/test/simple-client.ts");
    expect(output.stdout).contains("1 passing");
    expect(output.status).equals(0);
  });

  it("propagates 'timeout'", () => {
    const output = cli("--port", "0", "--context", "wait=20", "--timeout", "10", "--", "tsx", "src/test/simple-client.ts");
    expect(output.stdout).contains("1 failing");
    expect(output.stdout).contains("Timeout of 10ms exceeded");
    expect(output.status).equals(1);
  });

  it("allows re-running in watch mode", () => {
    const output = cli("--port", "0", "--watch", "--", "tsx", "src/test/rerunning-client.ts");
    expect(output.stdout).contains("Running client #0");
    expect(output.stdout).contains("Running client #1");
    expect(output.stdout).contains("Running client #2");
    expect(output.status).equals(0);
  });

  it("kills unresponsive command when interrupted", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mocha-remote-cli-test-"));
    const outFile = path.join(tempDir, "out.txt");
    expect(fs.existsSync(outFile)).equals(false, "Expected the outfile to be missing");
    const cliProcess = spawnCli("--port", "0", "--context", `endlessLoop,outFile=${outFile}`,  "--", "tsx", "src/test/hanging-client.ts");

    const outFileContent = await waitForFile(outFile);
    const success = cliProcess.kill("SIGINT"); // Interrupt Mocha Remote CLI
    expect(success).equals(true, "Expected mocha-remote cli to exit when interrupted");
    
    // Wait a bit for Mocha Remote CLI to forcefully kill the command process
    await new Promise(resolve => cliProcess.once("close", resolve));
    expect(cliProcess.exitCode).equals(130); // Command terminated by user
    
    const { code, pid } = JSON.parse(outFileContent);
    expect(code).equals(undefined); // We're not expecting an exit event to be fired
    expect(typeof pid).equals("number");
    expect(() => {
      // Use kill to assert the process has exited:
      // > This method will throw an error if the target pid does not exist.
      // > As a special case, a signal of 0 can be used to test for the existence of a process.
      // see https://nodejs.org/api/process.html#processkillpid-signal
      process.kill(pid, 0);
    }).throws("kill ESRCH");
  });

  it("exits clean and kills hanging commands", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mocha-remote-cli-test-"));
    const outFile = path.join(tempDir, "out.txt");
    expect(fs.existsSync(outFile)).equals(false, "Expected the outfile to be missing");
    const output = cli("--port", "0", "--context", `outFile=${outFile}`,  "--", "tsx", "src/test/hanging-client.ts");
    expect(output.status).equals(0, "Expected signal of the mocha-remote cli to remain a success");

    // Checking the "exit" of the wrapped command
    expect(fs.existsSync(outFile)).equals(true, "Expected the outfile to exist");
    const { code, pid } = JSON.parse(fs.readFileSync(outFile, "utf8"));
    expect(code).equals(143); // 143 is SIGTERM
    expect(typeof pid).equals("number");
    expect(() => {
      // Use kill to assert the process has exited:
      // > This method will throw an error if the target pid does not exist.
      // > As a special case, a signal of 0 can be used to test for the existence of a process.
      // see https://nodejs.org/api/process.html#processkillpid-signal
      process.kill(pid, 0);
    }).throws("kill ESRCH");
  });

  describe("failures", () => {
    it("propagates failures as exit code", () => {
      const output = cli("--port", "0", "--context", "failure=Totally expected", "--", "tsx", "src/test/simple-client.ts");
      expect(output.stdout).contains("Totally expected");
      expect(output.status).equals(1);
    });

    it("exits on error when asked", () => {
      const output = cli("--port", "0", "--exit-on-error", "--", "tsx", "src/test/throwing-client.ts");
      expect(output.stderr).contains("ERROR b00m!");
      expect(output.status).equals(1);
    });

    it("exits unclean if client dies early", () => {
      const output = cli("--port", "0", "--exit-on-error", "--", "tsx", "src/test/exit-shield.ts", "100", "tsx", "src/test/crashing-client.ts", "early");
      expect(output.stderr).contains("DISCONNECTION").contains("code = 1006");
      expect(output.status).equals(1);
    });

    it("exits unclean if client dies later", () => {
      const output = cli("--port", "0", "--exit-on-error", "--", "tsx", "src/test/exit-shield.ts", "100", "tsx", "src/test/crashing-client.ts", "later");
      expect(output.stderr).contains("DISCONNECTION").contains("code = 1006");
      expect(output.status).equals(1);
    });
  });
});
