import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths, so the same build runs at the root locally and under /signal/ on GitHub Pages
  base: './',
  server: { port: 5180, host: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as any);
