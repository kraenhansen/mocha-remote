describe("A test suite", () => {
  beforeEach((done) => {
    // It might take some time to setup
    setTimeout(done, 1000);
  });

  it("can succeed", (done) => {
    // It might take some time to succeed
    setTimeout(done, 500);
  });

  it("can succeed twice", (done) => {
    // It might take some time to succeed again
    setTimeout(done, 500);
  });

  it("can fail if the context needs it to", function() {
    if (this.shouldThrow) {
      throw new Error("Expected error!");
    }
  });
});
