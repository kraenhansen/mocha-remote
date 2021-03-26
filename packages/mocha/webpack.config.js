const path = require('path');
const webpack = require('webpack');

const mochaRootPath = path.resolve('../../node_modules/mocha');

module.exports = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    path: path.resolve('./dist'),
    filename: 'mocha.bundle.js',
    library: {
      type: 'commonjs'
    }
  },
  externals: {
    // debug: 'commonjs2 debug'
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
    fallback: {
      'util': require.resolve('util/'),
      'events': require.resolve('events/'),
    }
  },
  optimization: {
    minimize: false,
  },
  performance: {
    maxEntrypointSize: 300000,
    maxAssetSize: 300000,
  },
  experiments: {
    // @see https://github.com/webpack/webpack/issues/2933#issuecomment-774253975
    outputModule: true
  },
  plugins: [
    new webpack.NormalModuleReplacementPlugin(/^debug$/, path.resolve('./src/extended-debug.js')),
  ]
};
