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
      type: "test",
      title: "dummy test",
      $$fullTitle: "full title"
    });
    const result = deserialize(input) as Test;
    expect(result.type).equals("test");
    expect(typeof result.fullTitle).equals("function");
    expect(result.fullTitle()).equals("full title");
  });

  it("can deserialize an Error", () => {
    const input = stringify({
      type: "error",
      message: "Something went wrong",
      stack: "... stack"
    });
    const error = deserialize(input) as Error;
    expect(error).instanceOf(Error);
    expect(error.message).equals("Something went wrong");
    expect(error.stack).equals("... stack");
  });
});
