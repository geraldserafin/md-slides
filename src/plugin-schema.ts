// For `slides check` and the language server (node): the nodes a deck's plugins add, read from the deck's `plugins` (deck.json or a `deck` node). An npm
// plugin may describe its tags as data in its package.json (`"slideit": { "entry": "dist/plugin.js", "tags": { … } }`),
// which needs no code to run; otherwise the plugin module is imported (it works if it does not need a browser at load time).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readDeckMeta } from './deckfiles.ts';
import type { NodeDef } from './schema.ts';

type Tags = Record<string, Partial<NodeDef>>;

/** the file of a plugin entry of deck.json, and its package.json `slideit` field when it is an npm package */
export function resolvePlugin(deckDir: string, entry: string): { file: string; root?: string; slideit?: { entry?: string; tags?: Tags } } | undefined {
  if (/^[./]/.test(entry)) return { file: join(deckDir, entry) };
  try {
    const pkgFile = createRequire(join(deckDir, 'x.js')).resolve(`${entry}/package.json`, { paths: [deckDir, process.cwd()] });
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
    return { file: join(dirname(pkgFile), pkg.slideit?.entry ?? pkg.module ?? pkg.main ?? 'index.js'), root: dirname(pkgFile), slideit: pkg.slideit };
  } catch {
    return undefined;
  }
}

export async function pluginTags(deckDir: string): Promise<Tags> {
  let entries: string[] = [];
  try { entries = readDeckMeta(deckDir).plugins ?? []; } catch { return {}; }
  const out: Tags = {};
  for (const e of entries) {
    const p = resolvePlugin(deckDir, e);
    if (!p) continue;
    if (p.slideit?.tags) { Object.assign(out, p.slideit.tags); continue; }
    try {
      const mod = await import(pathToFileURL(p.file).href);
      for (const [name, t] of Object.entries((mod.default?.tags ?? {}) as Record<string, { doc: string; attrs?: NodeDef['props'] }>)) out[name] = { doc: t.doc, props: t.attrs };
    } catch { /* a plugin that needs a browser: its tags stay unknown here */ }
  }
  return out;
}
