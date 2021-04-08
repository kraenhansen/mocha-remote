const p = require("process/browser");

p.listenerCount = () => { return 0 };

module.exports = p;
