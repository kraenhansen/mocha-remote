import fs from "fs";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import cp from "child_process";
import chalk from "chalk";
import { inspect } from "util";

const packageJsonPath = new URL("../package.json", import.meta.url);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

import { Server, ReporterOptions, CustomContext, WebSocket, ClientError } from "mocha-remote-server";

export type Logger = (...args: unknown[]) => void;

export type CleanupTask = () => (void | Promise<void>);
const cleanupTasks: CleanupTask[] = [];

async function cleanup() {
  // Move the tasks into a local variable to avoid rerunning these on multiple invokations
  const tasks = cleanupTasks.splice(0, cleanupTasks.length);
  await Promise.all(tasks.map(task => task())).catch(err => {
    // eslint-disable-next-line no-console
    console.error(`Failed while cleaning up: ${err}`);
  });
}

type KeyValues = { [key: string]: string | true };

function isNumeric(value: string) {
  return /^-?\d+$/.test(value);
}

function coerceValue(value: string): string | number | boolean {
  if (value.toLowerCase() === "false") {
    return false;
  } else if (value.toLowerCase() === "true") {
    return true;
  } else if (isNumeric(value)) {
    return parseFloat(value);
  } else {
    return value;
  }
}

function parseKeyValues(opts: string[]): KeyValues {
  // Split on , since element might contain multiple key,value pairs
  // Flat because the parameter might be included multiple times
  const pairs = opts.map(value => value.split(",")).flat();
  const splitPairs = pairs.map(pair => {
    const [key, value] = pair.split("=");
    if (typeof value === "string" && value.length > 0) {
      return [key, coerceValue(value)];
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

type ServerOptions = {
  log: Logger;
  server: Server;
  command?: string[];
  exitOnError?: boolean;
};

// Start the server
export async function startServer({ log, server, command, exitOnError }: ServerOptions): Promise<void> {
  cleanupTasks.push(async () => {
    if (server.listening) {
      log("🧹 Stopping server");
      await server.stop();
    }
  });

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
    if (code !== 1000 && exitOnError) {
      print(displayClient(ws), chalk.red("EXITTING"), "after an abnormal disconnect");
      process.exitCode = 1;
      cleanup().then(() => {
        process.exit();
      });
    }
  });

  server.on("error", (error) => {
    if (error instanceof ClientError) {
      /* eslint-disable-next-line no-console */
      console.error(
        displayClient(error.ws),
        chalk.red("ERROR"),
        `${error.message || "Missing a message"}`,
      );
    } else {
      /* eslint-disable-next-line no-console */
      console.error(
        chalk.red("ERROR"),
        `${error.message || "Missing a message"}`,
      );
    }
    // Exit right away
    if (exitOnError) {
      process.exitCode = 1;
      cleanup();
    }
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
      shell: true,
      env: {
        ...process.env,
        MOCHA_REMOTE_URL: server.url,
        MOCHA_REMOTE_PORT: server.port.toString(),
        MOCHA_REMOTE_ID: server.config.id,
      }
    });

    const commandDescription = `${chalk.italic(...command)} (pid = ${chalk.bold(commandProcess.pid)})`
    
    cleanupTasks.push(() => {
      if (commandProcess.connected) {
        log(`🧹 Terminating: ${commandDescription}`);
        const success = commandProcess.kill();
        if (!success) {
          log(`💀 Sending SIGKILL to pid = ${commandProcess.pid}`);
          commandProcess.kill("SIGKILL");
        }
      }
    });

    /* eslint-disable-next-line no-console */
    log(
      chalk.dim(`Running: ${commandDescription}`),
      '\n'
    );

    // We should exit when the command process exits - and vise versa
    commandProcess.once("close", (code, signal) => {
      const cause = exitCause(code, signal);
      log('\n' + chalk.dim(`Command exited (${cause})`));
      // Inherit exit code from sub-process if nothing has already sat it
      if (typeof code === "number" && typeof process.exitCode !== "number") {
        process.exitCode = code;
      }
      cleanup();
    });

    process.on("SIGINT", () => {
      commandProcess.kill("SIGINT");
    });
    
    process.on("exit", () => {
      cleanup();
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
    .option('slow', {
      type: 'number',
      alias: 's',
      description: 'Specify "slow" test threshold (in milliseconds)',
      default: parseInt(process.env.MOCHA_REMOTE_SLOW || "75", 10),
    })
    .option('timeout', {
      type: 'number',
      alias: ['t', 'timeouts'],
      description: 'Specify test timeout threshold (in milliseconds)',
      default: parseInt(process.env.MOCHA_REMOTE_TIMEOUT || "2000", 10),
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
      default: process.env.MOCHA_REMOTE_SILENT === "true",
    })
    .option('exit-on-error', {
      type: 'boolean',
      description: 'Exit immediately if an error occurs',
      alias: 'e',
      default: process.env.MOCHA_REMOTE_EXIT_ON_ERROR === "true",
    })
    .command('$0 [command...]', 'Start the Mocha Remote Server', () => {}, (argv) => {
      function log(...args: unknown[]) {
        if (!argv.silent) {
          /* eslint-disable-next-line no-console */
          console.log(...args);
        }
      }

      const logoUrl = new URL('../logo.txt', import.meta.url);
      const logo = chalk.dim(fs.readFileSync(logoUrl));
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
        timeout: argv.timeout,
        slow: argv.slow,
      });

      // Extract any command given as positional argument
      const command = argv._.map(v => v.toString());

      startServer({
        log,
        server,
        command,
        exitOnError: argv.exitOnError as boolean,
      }).then(
        () => {
          if (!argv.watch) {
            // Run once and exit with the failures as exit code
            server.run(failures => {
              process.exitCode = failures;
            });
          }
        },
        err => {
          /* eslint-disable-next-line no-console */
          console.error(chalk.red("ERROR"), err.message);
          process.exitCode = 1;
        }
      );
    })
    .help(true)
    .alias('h', 'help')
    .argv
}
