const path = require('path');
const webpack = require('webpack');
const { merge } = require('webpack-merge');

const mochaRootPath = path.resolve('../../node_modules/mocha');

const common = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    path: path.resolve('./dist'),
    library: { type: 'commonjs' }
  },
  resolve: {
    alias: {
      // Providing a mocked version of cli.js
      // @see https://github.com/mochajs/mocha/blob/v8.3.2/lib/utils.js#L676-L679
      [path.resolve(mochaRootPath, 'lib/cli.js')]:
        path.resolve('./src/mocked-cli.js'),
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
    new webpack.NormalModuleReplacementPlugin(
      /^debug$/,
      path.resolve('./src/extended-debug.js'),
    ),
  ]
};

module.exports = [
  merge(common, {
    output: {
      filename: 'mocha.node.bundle.js',
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
      filename: 'mocha.browser.bundle.js',
    },
    resolve: {
      fallback: {
        'buffer': require.resolve('buffer/'),
        'events': require.resolve('events/'),
        'process': require.resolve('process/browser'),
        'util': require.resolve('util/'),
      }
    },
    plugins: [
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process',
      }),
    ]
  })
];
