// Require a file with a strange filename that will tell the user to install their shim
require("./you-need-a-shim-for-node-js-modules.js");
// Require the node version of Mocha
const Mocha = require("mocha/lib/mocha.js");
// Patching the Mocha instance as the brower entry does
// @see https://github.com/mochajs/mocha/blob/master/browser-entry.js#L112-L121
const originalUi = Mocha.prototype.ui;
Mocha.prototype.ui = function(ui) {
  originalUi.call(this, ui);
  // This will setup the mocha globals (describe, it, etc.)
  this.suite.emit('pre-require', global, null, this);
  return this;
};
module.exports = Mocha;
