// See notice in utils.js
// '`lookupFiles()` in module `mocha/lib/utils` has moved to module `mocha/lib/cli` and will be removed in the next major revision of Mocha'

module.exports.lookupFiles = () => {
  throw new Error("This is a mocked mocha/lib/cli.js");
}
