import debug, { Debugger } from "debug";

export type { Debugger };

const mochaDebug = debug('mocha-remote:client');

export function extend(namespace: string): Debugger {
  return mochaDebug.extend(namespace);
}
