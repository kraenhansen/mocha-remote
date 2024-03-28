import * as flatted from "flatted";
import { Suite } from "mocha-remote-mocha";

import { extend } from "./debug";
const debug = extend("serialization");

type Replacer = (this: unknown, key: string, value: unknown) => unknown;

/* eslint-disable-next-line @typescript-eslint/ban-types */
export type SerializedCache = WeakMap<object, Record<string, unknown>>;

function toJSON(value: Record<string, unknown>): Record<string, unknown> {
  if (value instanceof Error) {
    const { message, stack } = value;
    return {
      type: "error",
      message,
      stack,
    };
  } else if (typeof value === "object" && typeof value.serialize === "function") {
    const result = value.serialize();
    if (value instanceof Suite) {
      // Polyfill missing methods
      Object.assign(result, {
        "type": "suite",
        "$$total": value.total(),
      });
    }
    return result;
  } else {
    return value;
  }
}

export function createReplacer(): Replacer {
  return function(this: unknown, key: string, value: unknown) {
    debug(`Replacing %s`, value);
    if (typeof value === "object" && value !== null) {
      return toJSON(value as Record<string, unknown>);
    } else if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    return value;
  }
}

export function serialize(input: unknown, replacer = createReplacer()): string {
  return flatted.stringify(input, replacer);
}
