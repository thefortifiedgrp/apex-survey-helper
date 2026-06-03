import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // solid-js stays external so the consumer's Solid runtime is the single
  // reactive owner. The hook contains no JSX, so no Solid compile step is
  // needed — plain TS → JS preserves the solid-js calls.
  external: ['solid-js', 'solid-js/store', '@apextelemed/survey-core'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
