import * as server from "mocha-remote-server";
import * as client from "mocha-remote-client";

import { expect } from "chai";

type TestCase = [string, unknown, (result: unknown) => void];

const cases: TestCase[] = [
  [
    "a test",
    new client.mocha.Test("simple test"),
    after => {
      expect(after).instanceOf(server.mocha.Test);
      const test = after as server.mocha.Test;
      expect(test.title).equals("simple test");
    },
  ], [
    "a simple suite",
    () => {
      const suite = new client.mocha.Suite("simple suite");
      return suite;
    },
    after => {
      expect(after).instanceOf(server.mocha.Suite)
      const suite = after as server.mocha.Suite;
      expect(suite.title).equals("simple suite");
      expect(suite.root).equals(false);
    },
  ], [
    "a complex suite of tests",
    () => {
      const suite = new client.mocha.Suite("root suite");
      suite.root = true;
      const test1 = new client.mocha.Test("test 1");
      test1.parent = suite;
      const test2 = new client.mocha.Test("test 2");
      test2.parent = suite;
      suite.tests = [test1, test2];
      return suite;
    },
    after => {
      expect(after).instanceOf(server.mocha.Suite)
      const suite = after as server.mocha.Suite;
      expect(suite.title).equals("root suite");
      expect(suite.root).equals(true);
      expect(suite.tests[0]).instanceOf(server.mocha.Test);
      expect(suite.tests[0].title).equals("test 1");
      expect(suite.tests[1]).instanceOf(server.mocha.Test);
      expect(suite.tests[1].title).equals("test 2");
    },
  ], [
    "a test from a complex suite of tests",
    () => {
      const suite = new client.mocha.Suite("root suite");
      suite.root = true;
      const test1 = new client.mocha.Test("test 1");
      test1.parent = suite;
      const test2 = new client.mocha.Test("test 2");
      test2.parent = suite;
      suite.tests = [test1, test2];
      return test1;
    },
    after => {
      expect(after).instanceOf(server.mocha.Test)
      const test = after as server.mocha.Test;
      const suite = test.parent as server.mocha.Suite;
      expect(suite.title).equals("root suite");
      expect(suite.root).equals(true);
      expect(suite.tests[0]).instanceOf(server.mocha.Test);
      expect(suite.tests[0].title).equals("test 1");
      expect(suite.tests[1]).instanceOf(server.mocha.Test);
      expect(suite.tests[1].title).equals("test 2");
      expect(test).equals(test.parent?.tests[0]);
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

