import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

/** Bundle unique exécuté par le runtime Node du Stream Deck. */
export default {
  input: 'src/plugin.ts',
  output: {
    file: 'com.supernon0.multioutils.sdPlugin/bin/plugin.js',
    format: 'es',
    sourcemap: false
  },
  external: [/^node:/],
  plugins: [
    typescript({ tsconfig: './tsconfig.json' }),
    nodeResolve({ preferBuiltins: true }),
    commonjs()
  ]
};
