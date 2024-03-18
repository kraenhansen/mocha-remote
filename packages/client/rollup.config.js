import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

import pkg from './package.json' assert { type: "json" };

export default [{
  input: 'src/node/index.ts',
  output: [
    { file: pkg.main, format: 'cjs', sourcemap: true },
    { file: pkg.module, format: 'es', sourcemap: true }
  ],
  plugins: [
    nodeResolve({
      preferBuiltins: true,
    }),
    commonjs({
      include: [
        '../mocha/dist/node/mocha.js',
      ],
    }),
    typescript({
      tsconfig: "./tsconfig.node.json",
      declaration: false,
    }),
  ],
  external: ["debug", "fast-deep-equal", "flatted", "mocha-remote-client", "ws", "events"],
}, {
  input: 'src/browser/index.ts',
  output: [
    { file: pkg.browser, format: 'es', sourcemap: true }
  ],
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs({
      include: [
        '../mocha/dist/browser/mocha.js',
        '../../node_modules/events/events.js',
      ],
    }),
    typescript({
      tsconfig: "./tsconfig.browser.json",
      declaration: false,
    }),
  ],
  external: ["debug", "fast-deep-equal", "flatted", "mocha-remote-client"],
}, {
  input: 'src/index.ts',
  output: [
    { file: pkg.types, format: 'es' }
  ],
  plugins: [
    nodeResolve({
      preferBuiltins: false,
    }),
    commonjs(),
    dts({
      tsconfig: "./tsconfig.types.json",
      respectExternal: true
    }),
  ],
  external: ["debug", "fast-deep-equal", "flatted", "mocha-remote-client", "mocha"],
}];
