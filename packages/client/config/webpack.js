const { dirname, resolve } = require("path");
const { ContextReplacementPlugin } = require("webpack");

const MOCHA_LIB_PATH = resolve(dirname(require.resolve("mocha")), "lib");

module.exports = {
  mode: "production",
  entry: {
    main: "./src/index.ts",
    "react-native": "./src/react-native.js"
  },
  output: {
    path: resolve(__dirname, "../dist/bundled"),
    filename: "[name].bundle.js",
    libraryTarget: "commonjs2",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    alias: {
      mocha: require.resolve("mocha/lib/mocha"),
    }
  },
  module: {
    rules: [
      { test: /\.tsx?$/, loader: "ts-loader" }
    ]
  },
  node: {
    fs: "empty",
  },
  plugins: [
    new ContextReplacementPlugin({
      test: (p) => p === MOCHA_LIB_PATH,
    }, (context) => {
      // We can safely ignore requires at these locations:
      const ignoredLines = [ 162, 167, 212, 250 ];
      for (const d of context.dependencies) {
        if (d.critical && ignoredLines.indexOf(d.loc.start.line) !== -1) {
          d.critical = false;
        }
      }
      return context;
    }),
    new ContextReplacementPlugin({
      test: (p) => p === resolve(__dirname, "../src"),
    }, (context) => {
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
