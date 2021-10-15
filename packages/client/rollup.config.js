import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';

import pkg from './package.json';

export default [{
  input: 'src/node/index.ts',
  output: [
    { file: pkg.main, format: 'cjs' },
    { file: pkg.module, format: 'es' }
  ],
  plugins: [
    nodeResolve({
      preferBuiltins: true,
    }),
    commonjs({
      include: [
        '../mocha/dist/mocha.node.bundle.js',
      ],
    }),
    typescript({
      module: "esnext",
      exclude: ["src/**/*.test.ts"]
    }),
  ],
  external: ["debug", "fast-deep-equal", "flatted", "mocha-remote-client", "ws"],
}, {
  input: 'src/browser/index.ts',
  output: [
    { file: pkg.browser, format: 'es' }
  ],
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs(),
    typescript({
      module: "esnext",
      exclude: ["src/**/*.test.ts"]
    }),
  ],
  external: ["debug", "fast-deep-equal", "flatted", "mocha-remote-client"],
}];
