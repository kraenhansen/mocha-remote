/* global global */

import "./stdout-shim";

import { MochaRemoteClient } from ".";

class RNMochaRemoteClient extends MochaRemoteClient {
  // When creating a Mocha instance on React-Native we override the addFile method to require the file right away
  instrument(mocha) {
    // Override the addFile method
    mocha.addFile = () => {
      console.error("React Native doesn't support requiring files like addFile does, call require(...) in the whenInstrumented callback instead.");
    };
    mocha.suite.emit('pre-require', global, null, mocha);
    const instrumentedMocha = super.instrument(mocha);
    mocha.suite.emit('post-require', global, null, mocha);
    return instrumentedMocha;
  }
}

export * from ".";
export { RNMochaRemoteClient as MochaRemoteClient };
