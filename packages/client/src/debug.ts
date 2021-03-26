import Debug from "debug";

const debug = Debug('mocha-remote:client');

export function extend(namespace: string): Debug.Debugger {
  return debug.extend(namespace);
}
