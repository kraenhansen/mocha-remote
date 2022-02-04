import flatted from "flatted";

import { extend } from "./debug";
const debug = extend("serialization");

type Reviver = (this: unknown, key: string, value: unknown) => unknown;

export function createReviver(): Reviver {

  function reviveObject(obj: Record<string, unknown>) {
    if (obj.type === "error") {
      if (typeof obj.message === "string" && typeof obj.stack === "string") {
        const err = new Error(obj.message);
        err.stack = obj.stack;
        return err;
      } else {
        throw new Error("Expected Error to have message and stack");
      }
    } else {
      // Turn $$ properties into functions
      for (const propertyName of Object.keys(obj).filter(name => name.startsWith("$$"))) {
        const result = obj[propertyName];
        obj[propertyName.substring(2)] = () => result;
      }
      return obj;
    }
  }

  return function reviver(this: unknown, key: string, value: unknown) {
    debug(`Reviving %s`, value);
    if (typeof value === "object" && value !== null) {
      return reviveObject(value as Record<string, unknown>);
    } else {
      return value;
    }
  }
}

export function deserialize(text: string, reviver = createReviver()): unknown {
  debug("Deserializing %s", text);
  return flatted.parse(text, reviver);
}
