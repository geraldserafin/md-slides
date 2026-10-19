import { defineConfig } from 'vite';

// base './' -> works under any sub-path (e.g. GitHub Pages: user.github.io/repo/).
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
} as Parameters<typeof defineConfig>[0]);
