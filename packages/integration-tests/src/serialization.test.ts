import * as server from "mocha-remote-server";
import * as client from "mocha-remote-client";

import { expect } from "chai";

type TestCase = [string, unknown, (result: unknown) => void];

const cases: TestCase[] = [
  [
    "a simple suite",
    () => {
      const suite = new client.mocha.Suite("simple suite");
      return suite;
    },
    after => {
      const suite = after as server.mocha.Suite;
      expect(suite.title).equals("simple suite");
      expect(suite.root).equals(false);
    },
  ], [
    "a test in a suite",
    () => {
      const test = new client.mocha.Test("simple test");
      test.parent = new client.mocha.Suite("root suite");
      return test;
    },
    after => {
      const test = after as server.mocha.Test;
      expect(test.title).equals("simple test");
    },
  ]
];

describe("serialization", () => {
  for (const [what, before, check] of cases) {
    it(`serialize + deserialize ${what}`, () => {
      const str = client.serialization.serialize(typeof before === "function" ? before() : before);
      const after = server.serialization.deserialize(str);
      check(after);
    });
  }
});

