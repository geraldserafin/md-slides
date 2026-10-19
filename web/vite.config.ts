import { defineConfig } from 'vite';

// base './' -> działa pod dowolnym podkatalogiem (np. GitHub Pages: user.github.io/repo/).
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
} as Parameters<typeof defineConfig>[0]);
