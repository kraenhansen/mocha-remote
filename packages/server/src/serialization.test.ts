import { expect } from "chai";
import { Test } from "mocha";
import { stringify } from "flatted";

import { deserialize } from "./serialization";

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

  it("can deserialize a Test with an array $$ property", () => {
    // Wrapped in a message envelope, like the events sent by the client: the
    // Test needs to be nested for flatted to resolve it lazily.
    const input = stringify({
      action: "event",
      name: "fail",
      args: [{
        type: "test",
        title: "dummy test",
        $$fullTitle: "dummy suite dummy test",
        $$titlePath: ["dummy suite", "dummy test"]
      }]
    });
    const { args: [result] } = deserialize(input) as { args: [Test] };
    expect(typeof result.titlePath).equals("function");
    expect(result.titlePath()).deep.equals(["dummy suite", "dummy test"]);
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
