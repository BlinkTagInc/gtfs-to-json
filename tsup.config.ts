import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/bin/gtfs-to-json.ts'],
  dts: true,
  clean: true,
  format: ['esm'],
  splitting: false,
  sourcemap: true,
  minify: false,
});