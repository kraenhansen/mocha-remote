const path = require('path');
const rspack = require('@rspack/core');
const { merge } = require('webpack-merge');

const common = {
  mode: 'production',
  entry: './src/index.js',
  devtool: 'source-map',
  output: {
    library: { type: 'commonjs' }
  },
  resolve: {
    alias: {
      // @see https://github.com/mochajs/mocha/blob/v8.3.2/lib/utils.js#L13
      "path": path.resolve('./src/mocked-path.js'),
    },
  },
  optimization: {
    minimize: false,
  },
  performance: {
    maxEntrypointSize: 300000,
    maxAssetSize: 300000,
  },
  plugins: [
    new rspack.NormalModuleReplacementPlugin(
      /^debug$/,
      path.resolve('./src/extended-debug.js'),
    ),
  ]
};

module.exports = [
  merge(common, {
    output: {
      path: path.resolve('./dist/node'),
      // This filename is important for it to be stripped from stacktraces
      // @see https://github.com/mochajs/mocha/blob/a5b565289b40a839af086b13fb369e04e205ed4b/lib/utils.js#L452
      filename: 'mocha.js',
    },
    resolve: {
      fallback: {
        'buffer': false,
        'events': false,
        'util': false,
      }
    },
    externals: {
      buffer: 'commonjs2 buffer',
      events: 'commonjs2 events',
      util: 'commonjs2 util'
    },
  }),
  merge(common, {
    output: {
      path: path.resolve('./dist/browser'),
      // This filename is important for it to be stripped from stacktraces
      // @see https://github.com/mochajs/mocha/blob/a5b565289b40a839af086b13fb369e04e205ed4b/lib/utils.js#L452
      filename: 'mocha.js',
    },
    resolve: {
      fallback: {
        'buffer': require.resolve('buffer/'),
        'events': require.resolve('events/'),
        'process': path.resolve('./src/mocked-process.js'),
        'util': require.resolve('util/'),
      }
    },
    plugins: [
      new rspack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: path.resolve('./src/mocked-process.js'),
      }),
    ]
  })
];
