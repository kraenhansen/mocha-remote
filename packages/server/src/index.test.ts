import { expect } from "chai";

import { MochaRemoteServer } from ".";

describe("MochaRemoteServer", () => {
  it("can initialize", () => {
    const server = new MochaRemoteServer();
    expect(server).to.be.an("object");
  });
});
