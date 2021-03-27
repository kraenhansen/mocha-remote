import fs from "fs";
import path from "path";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import cp from "child_process";
import chalk from "chalk";

const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

import { Server, ReporterOptions, WebSocket } from "mocha-remote-server";

type ParserOptions = { [key: string]: string |true };

function parseParserOptions(opts: string[]) {
  return opts.reduce((acc, opt) => {
    const pair = opt.split('=');
    if (pair.length > 2 || !pair.length) {
      throw new Error(`invalid reporter option '${opt}'`);
    }

    acc[pair[0]] = pair.length === 2 ? pair[1] : true;
    return acc;
  }, {} as ParserOptions)
}

// Start the server
export async function run(server: Server, command?: string[]): Promise<number> {
  await server.start();
  // User stopping the process in a terminal
  process.on("SIGINT", () => {
    server.stop().then(undefined, err => {
      /* eslint-disable-next-line no-console */
      console.error(chalk.red("ERROR"), `Failed to stop server: ${err.message}`);
    });
  });

  if (command) {
    const [commandName, ...args] = command;
    const commandProcess = cp.spawn(commandName, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        MOCHA_REMOTE_URL: server.getUrl(),
      }
    });
    /* eslint-disable-next-line no-console */
    console.log(
      chalk.dim(`Running command: ${chalk.italic(...command)} (pid = ${chalk.bold(commandProcess.pid)})`),
      '\n'
    );
    // We should exit when the command process exits - and vise versa
    commandProcess.once("exit", (code) => {
      /* eslint-disable-next-line no-console */
      console.log('\n' + chalk.dim(`Command exited (status = ${typeof code === "number" ? code : 'unknown'})`));
      if (typeof code === "number") {
        process.exit(code);
      } else {
        // This is unexpected
        process.exit(1);
      }
    });
    process.on("SIGINT", () => {
      commandProcess.kill("SIGINT");
    });
  }

  // Start the runner
  return new Promise(resolve => server.run(resolve));
}

let connectionCount = 0;
const connections = new WeakMap<WebSocket, number>();
function displayClient(ws: WebSocket) {
  let connectionIndex = connections.get(ws);
  if (typeof connectionIndex !== "number") {
    connectionIndex = connectionCount++;
    connections.set(ws, connectionIndex);
  }
  return chalk.dim(`[${connectionIndex}]`);
}

if (module.parent === null) {
  const logo = chalk.dim(fs.readFileSync(path.resolve(__dirname, '../logo.txt')));
  /* eslint-disable-next-line no-console */
  console.log(logo);

  const argv = yargs(hideBin(process.argv))
    .scriptName('mocha-remote')
    .version('version', 'Show version number & exit', packageJson.version)
    .alias('v', 'version')
    .option('hostname', {
      description: 'Network hostname to use when listening for clients',
      default: '0.0.0.0',
      alias: 'H',
    })
    .option('port', {
      description: 'Network port to use when listening for clients',
      default: 8090,
      alias: 'P',
    })
    .option('id', {
      description: 'Connections not matching this will be closed',
      default: 'default',
      alias: 'I',
    })
    .option('reporter', {
      description: 'Specify reporter to use',
      alias: 'R',
      default: 'spec',
    })
    .option('reporter-option', {
      description: 'Reporter-specific options (<k=v,[k1=v1,..]>)',
      type: 'array',
      coerce: parseParserOptions,
      alias: ['O', 'reporter-options'],
    })
    .help(true)
    .alias('h', 'help')
    .argv

  // Create a mocha server instance
  const server = new Server({
    autoStart: false,
    host: argv.hostname,
    port: argv.port,
    id: argv.id,
    reporter: argv.reporter,
    reporterOptions: argv.reporterOption as ReporterOptions,
  });

  server.on('started', server => {
    const url = server.getUrl();
    /* eslint-disable-next-line no-console */
    console.log(
      chalk.green("LISTENING"),
      `on ${chalk.bold(url)}`,
      `for clients with id = ${chalk.bold(argv.id)}`
    );
  })

  server.on("connection", (ws, req) => {
    /* eslint-disable-next-line no-console */
    console.log(
      displayClient(ws),
      chalk.green("CONNECTION"),
      `from ${req.socket.remoteAddress + ':' + req.socket.remotePort}`,
    );
  });

  server.on("disconnection", (ws, code, reason) => {
    /* eslint-disable-next-line no-console */
    console.warn(
      displayClient(ws),
      chalk.yellow("DISCONNECTION"),
      `${reason || "for no particular reason"} (code = ${code})`,
    );
  });

  server.on("error", (error) => {
    /* eslint-disable-next-line no-console */
    console.error(
      chalk.red("ERROR"),
      `${error.message || "Missing a message"}`,
    );
  });

  // Extract any command following "--"
  const commandStart = process.argv.indexOf("--");
  const command = commandStart !== -1 ? process.argv.slice(commandStart + 1) : undefined;

  run(server, command).then(
    failures => {
      process.exit(failures);
    },
    err => {
      /* eslint-disable-next-line no-console */
      console.error(chalk.red("ERROR"), err.message);
      process.exit(1);
    }
  );
}
