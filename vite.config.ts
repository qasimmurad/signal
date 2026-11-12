import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5180, host: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as any);
