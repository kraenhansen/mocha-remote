import fs from "fs";
import path from "path";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import cp from "child_process";
import chalk from "chalk";
import { inspect } from "util";

const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

import { Server, ReporterOptions, CustomContext, WebSocket } from "mocha-remote-server";

type KeyValues = { [key: string]: string | true };
type Logger = (...args: unknown[]) => void;

function parseKeyValues(opts: string[]): KeyValues {
  // Split on , since element might contain multiple key,value pairs
  // Flat because the parameter might be included multiple times
  const pairs = opts.map(value => value.split(",")).flat();
  const splitPairs = pairs.map(pair => {
    const [key, value] = pair.split("=");
    if (typeof value === "string" && value.length > 0) {
      return [key, value];
    } else {
      return [key, true];
    }
  }).filter(([k]) => k !== "");
  return Object.fromEntries(splitPairs);
}

function exitCause(code: number | null, signal: string | null) {
  if (typeof code === "number") {
    return `code = ${code}`;
  } else if (signal) {
    return `signal = ${signal}`;
  } else {
    return 'unknown cause';
  }
}

// Start the server
export async function startServer(log: Logger, server: Server, command?: string[]): Promise<void> {
  server.on('started', server => {
    const url = server.url;
    log(
      chalk.green("LISTENING"),
      `on ${chalk.bold(url)}`,
      `for clients with id = ${chalk.bold(server.config.id)}`
    );
  })

  server.on("connection", (ws, req) => {
    log(
      displayClient(ws),
      chalk.green("CONNECTION"),
      `from ${req.socket.remoteAddress + ':' + req.socket.remotePort}`,
    );
  });

  server.on("disconnection", (ws, code, reason) => {
    /* eslint-disable-next-line no-console */
    const print = code === 1000 ? log : console.warn;
    const color = code === 1000 ? chalk.green : chalk.yellow;
    const msg = code === 1000 ? "normal closure" : reason || "for no particular reason";
    print(displayClient(ws), color("DISCONNECTION"), `${msg} (code = ${code})`);
  });

  server.on("error", (error) => {
    /* eslint-disable-next-line no-console */
    console.error(
      chalk.red("ERROR"),
      `${error.message || "Missing a message"}`,
    );
  });

  await server.start();
  // User stopping the process in a terminal
  process.on("SIGINT", () => {
    server.stop().then(undefined, err => {
      /* eslint-disable-next-line no-console */
      console.error(chalk.red("ERROR"), `Failed to stop server: ${err.message}`);
    });
  });

  if (command && command.length > 0) {
    const [commandName, ...args] = command;
    const commandProcess = cp.spawn(commandName, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        MOCHA_REMOTE_URL: server.url,
        MOCHA_REMOTE_PORT: server.port.toString(),
        MOCHA_REMOTE_ID: server.config.id,
      }
    });
    /* eslint-disable-next-line no-console */
    log(
      chalk.dim(`Running command: ${chalk.italic(...command)} (pid = ${chalk.bold(commandProcess.pid)})`),
      '\n'
    );

    // We should exit when the command process exits - and vise versa
    commandProcess.once("exit", (code, signal) => {
      const cause = exitCause(code, signal);
      log('\n' + chalk.dim(`Command exited (${cause})`));
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
    
    process.on("exit", () => {
      commandProcess.kill();
    });
  }
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

export function run(args = hideBin(process.argv)): void {
  yargs(args)
    .scriptName('mocha-remote')
    .version('version', 'Show version number & exit', packageJson.version)
    .alias('v', 'version')
    .option('hostname', {
      description: 'Network hostname to use when listening for clients',
      default: process.env.MOCHA_REMOTE_HOSTNAME || '0.0.0.0',
      alias: 'H',
    })
    .option('port', {
      description: 'Network port to use when listening for clients',
      default: parseInt(process.env.MOCHA_REMOTE_PORT || "8090", 10),
      alias: 'P',
    })
    .option('id', {
      description: 'Connections not matching this will be closed',
      default: process.env.MOCHA_REMOTE_ID || 'default',
      alias: 'I',
    })
    .option('grep', {
      description: 'Only run tests matching this string or regexp',
      type: 'string',
      default: process.env.MOCHA_REMOTE_GREP,
      alias: 'g',
    })
    .option('invert', {
      description: 'Inverts --grep matches',
      type: 'boolean',
      default: process.env.MOCHA_REMOTE_INVERT === "true",
      alias: 'i',
    })
    .option('watch', {
      description: 'Keep the server running after a test has ended',
      type: 'boolean',
      default: process.env.MOCHA_REMOTE_WATCH === "true" || false,
      alias: 'w',
    })
    .option('context', {
      description: 'Runtime context sent to client when starting a run (<k=v,[k1=v1,..]>)',
      type: 'array',
      alias: 'c',
      default: process.env.MOCHA_REMOTE_CONTEXT || [],
      coerce: parseKeyValues,
    })
    .option('reporter', {
      description: 'Specify reporter to use',
      alias: 'R',
      default: process.env.MOCHA_REMOTE_REPORTER || 'spec',
    })
    .option('reporter-option', {
      description: 'Reporter-specific options (<k=v,[k1=v1,..]>)',
      type: 'array',
      default: process.env.MOCHA_REMOTE_REPORTER_OPTIONS || [],
      coerce: parseKeyValues,
      alias: ['O', 'reporter-options'],
    })
    .option('silent', {
      type: 'boolean',
      description: 'Print less to stdout',
      alias: 's',
      default: process.env.MOCHA_REMOTE_SILENT === "true",
    })
    .command('$0 [command...]', 'Start the Mocha Remote Server', ({ argv }) => {
      function log(...args: unknown[]) {
        if (!argv.silent) {
          /* eslint-disable-next-line no-console */
          console.log(...args);
        }
      }

      const logo = chalk.dim(fs.readFileSync(path.resolve(__dirname, '../logo.txt')));
      log(logo);

      log(chalk.dim("reporter:"), argv.reporter);
      if (Object.keys(argv.context).length > 0) {
        log(chalk.dim("context:"), inspect(argv.context, false, null, true));
      }
      if (argv.watch) {
        log(chalk.dim("running in watch-mode"));
      }
      if (argv.grep) {
        log(chalk.dim("grep:"), argv.grep, argv.invert ? chalk.dim("(inverted)"): "");
      }
      log();

      // Create a mocha server instance
      const server = new Server({
        autoStart: false,
        autoRun: argv.watch,
        host: argv.hostname,
        port: argv.port,
        id: argv.id,
        reporter: argv.reporter,
        reporterOptions: argv.reporterOption as ReporterOptions,
        context: argv.context as unknown as CustomContext,
        grep: argv.grep,
        invert: argv.invert,
      });

      // Extract any command given as positional argument
      const command = argv._.map(v => v.toString());

      startServer(log, server, command).then(
        () => {
          if (!argv.watch) {
            // Run once and exit with the failures as exit code
            server.run(failures => {
              process.exit(failures);
            });
          }
        },
        err => {
          /* eslint-disable-next-line no-console */
          console.error(chalk.red("ERROR"), err.message);
          process.exit(1);
        }
      );
    })
    .help(true)
    .alias('h', 'help')
    .argv
}

if (module.parent === null) {
  run();
}
