import fs from "fs";
import path from "path";
import program from "commander";

import { MochaRemoteServer } from "mocha-remote-server";

/* eslint-disable no-console */

program
  .version(
    JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
    ).version
  )
  .usage("[options]")
  .option("-O, --reporter-options <k=v,k2=v2,...>", "reporter-specific options")
  .option("-R, --reporter <name>", "specify the reporter to use", "spec")
  .option("--full-trace", "display the full stack trace")
  .option(
    "-H, --hostname [hostname]",
    "specify the hostname that the Mocha Remote Server will listen to",
    "0.0.0.0"
  )
  .option(
    "-P, --port [port]",
    "specify the port that the Mocha Remote Server will listen to",
    "8090"
  )
  .option(
    "-I, --id [id]",
    "specify the id the clients will use to connect",
    "default"
  );

program._name = "mocha-remote";

program.parse(process.argv);

// Create a mocha server instance
const mocha = new MochaRemoteServer(
  {},
  {
    autoStart: false,
    host: program.hostname,
    port: parseInt(program.port, 10),
    id: program.id,
    onServerStarted: server => {
      const url = server.getUrl();
      console.log(
        `Mocha Remote Server is listening for clients with id = '${program.id}' on ${url}`
      );
    }
  }
);

// reporter options

const reporterOptions: { [key: string]: string | boolean } = {};
if (typeof program.reporterOptions === "string") {
  program.reporterOptions.split(",").forEach(opt => {
    const L = opt.split("=");
    if (L.length > 2 || L.length === 0) {
      throw new Error(`invalid reporter option '${opt}'`);
    } else if (L.length === 2) {
      reporterOptions[L[0]] = L[1];
    } else {
      reporterOptions[L[0]] = true;
    }
  });
}

// reporter

mocha.reporter(program.reporter, reporterOptions);

// --stack-trace

if (program.fullTrace) {
  mocha.fullTrace();
}

// let runner;

// Start the server
async function startServerAndRun(): Promise<number> {
  await mocha.start();
  // User stopping the process in a terminal
  process.on("SIGINT", () => {
    // runner.abort();
    mocha.stop().then(undefined, err => {
      console.error(`Failed to stop the Mocha Remote Server: ${err.message}`);
    });

    // This is a hack:
    // Instead of `process.exit(130)`, set runner.failures to 130 (exit code for SIGINT)
    // The amount of failures will be emitted as error code later
    // runner.failures = 130;
  });

  // Start the runner
  return new Promise(resolve => mocha.run(resolve));
}

startServerAndRun().then(
  failures => {
    process.exit(failures);
  },
  err => {
    console.error("Failed to stop the Mocha Remote Server", err.message);
    process.exit(1);
  }
);
