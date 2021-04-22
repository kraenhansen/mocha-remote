import { Test, Suite, Hook } from "mocha-remote-mocha";
import flatted from "flatted";
import deepEquals from "fast-deep-equal";

import { extend } from "./debug";
const debug = extend("serialization");

type Replacer = (this: unknown, key: string, value: unknown) => unknown;
export type TypedObject = { $ref: number, $type: string, $properties?: Record<string, unknown> }

/* eslint-disable-next-line @typescript-eslint/ban-types */
export type TypedObjectCache = WeakMap<object, TypedObject>;

const types = {
  test: Test,
  suite: Suite,
  hook: Hook,
  error: Error,
};

function toJSON(value: Record<string, unknown>): Record<string, unknown> {
  if (value instanceof Error) {
    const { message, stack } = value;
    return {
      message,
      stack: stack ? filterStack(stack) : stack,
    };
  } else {
    return { ...value };
  }
}

/* eslint-disable-next-line @typescript-eslint/ban-types */
function getType(value: object) {
  return Object.keys(types).find(key => value instanceof types[key as keyof typeof types]);
}

function filterStack(stack: string) {
  return stack.split("\n").filter(line => line.includes("client/dist/node.bundle.cjs.js") === false).join("\n");
}

export function createReplacer(): Replacer {
  let nextRef = 0;
  // The cache ensures that a $ref is transferred instead of the entire object, it this has already crossed the network
  const cache: TypedObjectCache = new WeakMap();
  // The local cache ensures the same object is returned for every object throughout a serialization
  const localCache = new Map();
  return function(this: unknown, key: string, value: unknown) {
    if (key === "") {
      debug("Clearing local cache");
      localCache.clear();
    }
    debug(`Replacing %s`, value);
    if (typeof value === "object" && value !== null) {
      const localCached = localCache.get(value);
      if (localCached) {
        debug("Already relaced this object");
        return localCached;
      }
      const type = getType(value);
      if (type) {
        const cached = cache.get(value);
        const $properties = toJSON(value as Record<string, unknown>);
        if (cached) {
          if (deepEquals(cached.$properties, $properties)) {
            // TODO: Make sure this object is reused to allow flatted to detect a cycle
            const result = { $ref: cached.$ref };
            localCache.set(value, result);
            return result;
          } else {
            // Update the cached value with the new properties.
            Object.assign(cached.$properties, $properties);
            const result = { $ref: cached.$ref, $properties };
            localCache.set(value, result);
            return result;
          }
        } else {
          const result: TypedObject = {
            $ref: nextRef++,
            $type: type,
            $properties,
          };
          cache.set(value, result);
          localCache.set(value, result);
          return result;
        }
      } else {
        return value;
      }
    } else if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    return value;
  }
}

export function serialize(input: unknown, replacer = createReplacer()): string {
  return flatted.stringify(input, replacer);
}
