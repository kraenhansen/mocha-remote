import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';

import pkg from './package.json';

export default {
  input: 'src/node/index.ts',
  output: [
    { file: pkg.main, format: 'cjs' },
    { file: pkg.module, format: 'es' }
  ],
  plugins: [
    nodeResolve({
      /*
      resolveOnly: [
        'mocha'
      ],
      */
    }),
    commonjs({
      include: [
        '../mocha/dist/mocha.bundle.js',
        './node_modules/debug/src/index.js',
        './node_modules/ws/index.js'
      ],
      // transformMixedEsModules: true
    }),
    typescript({
      module: "esnext"
    }),
  ]
};
