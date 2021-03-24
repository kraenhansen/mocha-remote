/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

const path = require('path');

const clientPath = path.resolve(__dirname, '../../../../client');

// Serves any module from the app's node_modules
const extraNodeModules = new Proxy(
    {},
    {
        get(target, name, receiver) {
            return path.resolve(__dirname, "node_modules", name);
        },
    },
);

module.exports = {
  watchFolders: [
    clientPath
  ],
  resolver: {
    extraNodeModules
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: false,
      },
    }),
  },
};
