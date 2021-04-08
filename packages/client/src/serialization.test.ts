import { expect } from "chai";
import { Suite, Test } from "mocha-remote-mocha";
import { parse } from "flatted";

import { serialize, createReplacer } from "./serialization";

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
    const result = serialize(test);
    const parsed = parse(result);
    expect(parsed).has.keys("$ref", "$type", "$properties");
  });

  it("can serialize the properties of a Test only once per replacer", () => {
    const test = new Test("test title");
    const replacer = createReplacer();
    let $ref: unknown;
    {
      // Serializing the first time should return an object with $type and $properties
      const result = serialize(test, replacer);
      const parsed = parse(result);
      expect(parsed).has.keys("$ref", "$type", "$properties");
      $ref = parsed.$ref;
    }
    {
      // Another instance of Test shouldn't reuse the ref
      const test2 = new Test("test title");
      const result = serialize(test2, replacer);
      const parsed = parse(result);
      expect(parsed).has.keys("$ref", "$type", "$properties");
      expect(parsed.$ref).not.equals($ref);
    }
    {
      // Serializing the same test should result in the same $ref
      const result = serialize(test, replacer);
      const parsed = parse(result);
      expect(parsed).has.keys("$ref");
      expect(parsed.$ref).equals($ref);
    }
    {
      // Serializing the same test should result in the same $ref and $properties if they have changed
      test.title = "new title";
      const result = serialize(test, replacer);
      const parsed = parse(result);
      expect(parsed).has.keys("$ref", "$properties");
      expect(parsed.$ref).equals($ref);
      expect(parsed.$properties.title).deep.equals("new title");
    }
  });

  it("can serialize a Test with a parent Suite", () => {
    const test = new Test("test title");
    const suite = new Suite("root suite");
    test.parent = suite;
    suite.tests = [ test ];
    {
      // Serializing the first time should return an object with $type and $properties
      const result = serialize(test);
      const parsed = parse(result);
      expect(parsed).has.keys("$ref", "$type", "$properties");
      const parent = parsed.$properties.parent;
      expect(parent).has.keys("$ref", "$type", "$properties");
      const tests = parent.$properties.tests;
      expect(parsed.$ref).equals(tests[0].$ref);
      expect(tests[0]).has.keys("$ref", "$type", "$properties");
      expect(parsed).equals(tests[0]);
    }
  });

  it("can serialize an Error", () => {
    const error = new Error("Something went wrong");
    const result = serialize(error);
    const { $properties } = parse(result);
    expect($properties.message).equals(error.message);
    expect($properties.stack).equals(error.stack);
  });
});
