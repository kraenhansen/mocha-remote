describe("A suite", () => {
  describe("with a sub-suite", () => {
    it("can pass", () => {
      console.log("Hello from a passing test");
    });
    it("can fail", () => {
      throw new Error("some failure");
    });
    it.skip("can skip", () => {
      /* tumbleweed */
    });
  });
});
