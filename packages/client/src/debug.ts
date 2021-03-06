import Debug, { Debugger } from "debug";
export type { Debugger };

const debug = Debug('mocha-remote:client');

export function extend(namespace: string): Debug.Debugger {
  return debug.extend(namespace);
}
