// The viewer (the app in src/, built by vite). A published package ships it prebuilt in viewer/<variant>/ so that
// `slides build` and `slides dev` need no vite and no compile step: they copy the viewer and add the decks next to it.
// From a clone (no viewer/ yet) the CLI falls back to building it on the fly.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** variants: with or without the diagram library (mermaid), normal or "single" (one chunk, small assets inlined) */
export const VARIANTS = [
  { single: false, mermaid: false }, { single: false, mermaid: true },
  { single: true, mermaid: false }, { single: true, mermaid: true },
];
export const variantName = ({ single, mermaid }) => `${single ? 'single' : 'app'}${mermaid ? '-mermaid' : ''}`;
export const viewerDir = (v) => join(rootDir, 'viewer', variantName(v));
export const hasViewer = (v) => existsSync(join(viewerDir(v), 'index.html'));

/** build the viewer with vite into `outDir`; `publicDir` (the staged decks) is copied into it. Needs vite (a dev dependency). */
export async function buildViewer({ outDir, publicDir = false, mermaid, single = false, base = './' }) {
  const { build, createLogger } = await import('vite');
  const logger = createLogger('warn');
  const warn = logger.warn;
  logger.warn = (m, o) => { if (!/externalized|inlineDynamicImports/.test(m)) warn(m, o); };
  await build({
    root: rootDir, configFile: join(rootDir, 'vite.config.ts'), logLevel: 'warn', customLogger: logger, publicDir, base,
    build: {
      outDir, emptyOutDir: true,
      ...(single ? { assetsInlineLimit: (f) => !f.endsWith('.wasm'), cssCodeSplit: false, modulePreload: false } : {}),
      rollupOptions: { ...(single ? { output: { codeSplitting: false } } : {}), onwarn: (w, h) => w.code !== 'EVAL' && h(w) },
    },
    define: { __USE_MERMAID__: String(mermaid) },
  });
}
