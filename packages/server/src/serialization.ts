import { Test, Suite, Hook } from "mocha";
import flatted from "flatted";

const types = {
  test: Test,
  suite: Suite,
  hook: Hook,
  error: Error,
};

type ValueOf<T> = T[keyof T]

type Revivable = InstanceType<ValueOf<typeof types>>;
export type ObjectCache = Map<number, Revivable>;

import { extend } from "./debug";
const debug = extend("serialization");

type Reviver = (this: unknown, key: string, value: unknown) => unknown;

function createObject($type: unknown) {
  if (typeof $type === "string") {
    debug("createObject called with $type = %s", $type);
    const constructor = types[$type as keyof typeof types];
    if (constructor) {
      return Object.create(constructor.prototype, {});
    } else {
      throw new Error(`Unexpected $type '${$type}'`);
    }
  } else {
    return {};
  }
}

export function createReviver(): Reviver {
  const cache: ObjectCache = new Map();
  return function reviver(this: unknown, key: string, value: unknown) {
    debug(`Reviving %s`, value);
    if (typeof value === "object" && value !== null) {
      const { $ref, $type, $properties } = value as Record<string, unknown>;
      if (typeof $ref === "number") {
        const cached = cache.get($ref);
        const result = cached || createObject($type);
        if ($properties) {
          // Update the properties, if needed
          Object.assign(result, $properties);
        }
        if (!cached) {
          // Store the result in the cache
          cache.set($ref, result as Revivable);
        }
        return result;
      } else {
        // Just any other plain ol' object
        return value;
      }
    }
    return value;
  }
}

export function deserialize(text: string, reviver = createReviver()): unknown {
  debug("Deserializing %s", text);
  return flatted.parse(text, reviver);
}
