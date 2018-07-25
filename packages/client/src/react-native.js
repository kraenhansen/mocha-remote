import "./stdout-shim";

import { MochaRemoteClient } from ".";

MochaRemoteClient.DEFAULT_CONFIG.createMocha = (config) => {
  const mocha = new Mocha(config.mochaOptions);
  mocha.addFile = function(file) {
    // When creating a Mocha instance on React-Native we override the addFile method to require the file right away
    suite.emit('pre-require', global, file, this);
    suite.emit('require', require(file), file, this);
    suite.emit('post-require', global, file, this);
  }
};

export * from ".";
