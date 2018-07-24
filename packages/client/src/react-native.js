// Do as Mocha does for the browser and load a shim for the process.stdout
// @see https://github.com/mochajs/mocha/blob/master/browser-entry.js#L10
import * as stdout from "browser-stdout";
global.process.stdout = stdout();

// Export the entire library
export * from ".";
