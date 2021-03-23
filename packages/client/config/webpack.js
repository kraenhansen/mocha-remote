/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */

const { dirname, resolve } = require("path");
const { ContextReplacementPlugin } = require("webpack");

const MOCHA_LIB_PATH = resolve(dirname(require.resolve("mocha")), "lib");
const IGNORED_MOCHA_LINES = [
  162, // reporter() is patched to throw an error
  167, // reporter() is patched to throw an error
  212, // Calling ui() with a path is not supported
  250, // loadFiles() is patched to throw an error
  /* Mocha 6
  226, // reporter() is patched to throw an error
  234, // reporter() is patched to throw an error
  284, // Calling ui() with a path is not supported
  334, // loadFiles() is patched to throw an error
  349, // unloadFile() is patched to throw an error
  */
];

module.exports = {
  mode: "production",
  entry: {
    main: "./src/index.ts",
    browser: "./src/browser.js",
    "react-native": "./src/react-native.js"
  },
  output: {
    path: resolve(__dirname, "../dist/bundled"),
    filename: "[name].bundle.js",
    libraryTarget: "commonjs2",
  },
  performance: {
    maxEntrypointSize: 400000,
    maxAssetSize: 400000,
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".json"],
    alias: {
      mocha: require.resolve("mocha/lib/mocha"),
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        options: { configFile: "tsconfig.build.json" }
      }
    ]
  },
  node: {
    fs: "empty"
  },
  plugins: [
    new ContextReplacementPlugin({
      test: p => p === MOCHA_LIB_PATH,
    }, context => {
      // We can safely ignore requires at these locations:
      for (const d of context.dependencies) {
        if (d.critical && IGNORED_MOCHA_LINES.indexOf(d.loc.start.line) !== -1) {
          d.critical = false;
        }
      }
      return context;
    }),
    new ContextReplacementPlugin({
      test: p => p === resolve(__dirname, "../src"),
    }, context => {
      // We can safely ignore this critical context dependency - its the addFile override in src/react-native.js
      for (const d of context.dependencies) {
        if (d.critical && d.loc.start.line === 10) {
          d.critical = false;
        }
      }
      return context;
    }),
  ],
};
