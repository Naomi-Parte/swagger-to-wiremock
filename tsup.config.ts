import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    'log-forwarder': 'src/server/log-forwarder.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  shims: true,
  target: 'es2022',
  outDir: 'dist',
  tsconfig: 'tsconfig.json',
});
