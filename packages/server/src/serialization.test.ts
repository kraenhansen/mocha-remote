import { expect } from "chai";
import { Suite, Test } from "mocha";
import { stringify } from "flatted";

import { deserialize, createReviver } from "./serialization";

describe("Server serialization", () => {

  it("can deserialize a null", () => {
    const input = stringify({ value: null });
    const result = deserialize(input) as Record<string, unknown>;
    expect(result.value).equals(null);
  });

  it("can deserialize a Test", () => {
    const input = stringify({
      $ref: 0,
      $type: "test",
      $properties: {
        title: "dummy test",
      }
    });
    const test = deserialize(input);
    expect(test).instanceOf(Test);
  });

  it("will deserialize the properties of a Test only once per reviver", () => {
    let test1: unknown;
    const reviver = createReviver();
    {
      // Serializing the first time should return an object with $type and $properties
      test1 = deserialize(stringify({
        $ref: 0,
        $type: "test",
        $properties: {
          title: "dummy test",
        }
      }), reviver);
      expect(test1).instanceOf(Test);
      expect((test1 as Test).title).equals("dummy test");
    }
    {
      // Another instance of Test shouldn't reuse the object
      const test2 = deserialize(stringify({
        $ref: 1,
        $type: "test",
        $properties: {
          title: "dummy test 2",
        }
      }), reviver);
      expect(test2).instanceOf(Test);
      expect(test2).not.equals(test1);
    }
    {
      // Deserializing the same test should result in the same object
      const test3 = deserialize(stringify({ $ref: 0 }), reviver);
      expect(test3).instanceOf(Test);
      expect(test3).equals(test1);
    }
    {
      // Deserializing the same test should result in the same object, even when properties update
      const test3 = deserialize(stringify({
        $ref: 0,
        $properties: { title: "new title" },
      }), reviver);
      expect(test3).instanceOf(Test);
      expect(test3).equals(test1);
      expect((test3 as Test).title).equals("new title");
    }
  });

  it("will deserialize cycles", () => {
    const reviver = createReviver();
    // Serializing the first time should return an object with $type and $properties
    const test = {
      $ref: 0,
      $type: "test",
      $properties: {
        title: "dummy test",
        parent: {
          $ref: 1,
          $type: "suite",
          $properties: {
            title: "root",
            _beforeAll: [{
              $ref: 2,
              $type: "hook",
              $properties: {}
            }],
            tests: []
          }
        }
      }
    } as any;
    test.$properties.parent.$properties.tests.push(test);
    const result = deserialize(stringify(test), reviver) as Test;
    const parent = result.parent as Suite;
    expect(parent).instanceOf(Suite);
    expect(parent.tests[0]).equals(result);
    // Ensure the Test is correctly inheriting Runnable
    expect(result.titlePath()).deep.equals(["root", "dummy test"]);
  });

  it("can deserialize an Error", () => {
    const input = stringify({
      $ref: 0,
      $type: "error",
      $properties: {
        message: "Something went wrong",
        stack: "... stack"
      }
    });
    const error = deserialize(input) as Error;
    expect(error).instanceOf(Error);
    expect(error.message).equals("Something went wrong");
    expect(error.stack).equals("... stack");
  });
});
