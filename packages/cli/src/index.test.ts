import cp from "child_process";
import path from "path";
import { expect } from "chai";

const cliPath = path.resolve(__dirname, "./index.ts");

function cli(...args: string[]) {
  return cp.spawnSync(
    process.execPath,
    ["--require", "ts-node/register", cliPath, ...args],
    { encoding: 'utf8' },
  );
}

function parseJsonOutput(output: string) {
  const jsonStart = output.indexOf("{");
  const jsonEnd = output.lastIndexOf("}");
  return JSON.parse(output.slice(jsonStart, jsonEnd + 1));
}

describe("Mocha Remote CLI", () => {
  it("prints --help", () => {
    const output = cli("--help");
    expect(output.stdout).contains("Show version number & exit");
  });

  it("run the command after -- and propagates exit status code", () => {
    const output = cli("--port", "0", "--", "node", "--eval", "console.log('hello!');process.exit(13);");
    expect(output.stdout).contains("hello!");
    expect(output.status).equals(13, "expected signal to propagate");
  });

  it("expose hostname and port as environment variables", () => {
    const output = cli("--port", "0", "--", "node", "--print", "JSON.stringify(process.env)");
    const jsonOuput = parseJsonOutput(output.stdout);
    expect(jsonOuput).include.keys("MOCHA_REMOTE_URL");
    const MOCHA_REMOTE_URL: string = jsonOuput.MOCHA_REMOTE_URL;
    expect(MOCHA_REMOTE_URL.startsWith("ws://0.0.0.0"));
  });

  it("prints when client connects", () => {
    const output = cli("--port", "0", "--", "ts-node", "src/test/simple-client.ts");
    expect(output.stdout).contains("CONNECTION from 127.0.0.1");
  });
});
