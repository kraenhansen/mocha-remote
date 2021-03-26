// Break out of WebPack to avoid a circular replacement
/* global __non_webpack_require__ */
const debug = __non_webpack_require__("debug")("mocha-remote");
module.exports = debug.extend.bind(debug);
