import { expect } from "chai";
import { Suite, Test } from "mocha-remote-mocha";
import { parse } from "flatted";

import { serialize } from "./serialization";

describe("Client serialization", () => {
  it("can serialize a recursive structure with nulls", () => {
    const a: Record<string, unknown>= { value: null, foo: "foo" };
    a.recursive = a;
    const result = serialize(a);
    const parsed = parse(result);
    expect(parsed.value).equals(null);
    expect(parsed.recursive).equals(parsed);
  });

  it("can serialize a Test", () => {
    const test = new Test("test title");
    test.parent = new Suite("root suite");
    const result = serialize(test);
    const parsed = parse(result);
    expect(parsed).contain.keys("type", "__mocha_id__");
  });

  it("can serialize a Test with a parent Suite", () => {
    const test = new Test("test title");
    const suite = new Suite("root suite");
    suite.beforeAll(() => {
      // eslint-disable-next-line no-console
      console.log("Before hook ran");
    });
    test.parent = suite;
    suite.tests = [ test ];
    {
      // Serializing the first time should return an object with $type and $properties
      const result = serialize(test);
      // Test
      const parsed = parse(result);
      expect(parsed.type).equals("test");
      // Parent
      const parent = parsed.parent;
      expect(parent.$$fullTitle).equals("root suite");
    }
  });

  it("can serialize an Error", () => {
    const error = new Error("Something went wrong");
    const result = serialize(error);
    const parsed = parse(result);
    expect(parsed.type).equals("error");
    expect(parsed.message).equals(error.message);
    expect(parsed.stack).equals(error.stack);
  });
});
