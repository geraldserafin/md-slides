import { defineConfig } from 'vite';

// base './' -> works under any sub-path (e.g. GitHub Pages: user.github.io/repo/).
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  define: { __USE_MERMAID__: true }, // the CLI turns it off for decks without a mermaid fence
  test: { include: ['tests/**/*.test.ts'] },
} as Parameters<typeof defineConfig>[0]);
