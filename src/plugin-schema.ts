// For `slides check` and the language server (node): the tags a deck's plugins add, read from deck.json "plugins". An npm
// plugin may describe its tags as data in its package.json (`"slideit": { "entry": "dist/plugin.js", "tags": { … } }`),
// which needs no code to run; otherwise the plugin module is imported (it works if it does not need a browser at load time).
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TagDef } from './schema.ts';

type Tags = Record<string, Partial<TagDef>>;

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
  const deckJson = join(deckDir, 'deck.json');
  if (!existsSync(deckJson)) return {};
  let entries: string[] = [];
  try { entries = JSON.parse(readFileSync(deckJson, 'utf8')).plugins ?? []; } catch { return {}; }
  const out: Tags = {};
  for (const e of entries) {
    const p = resolvePlugin(deckDir, e);
    if (!p) continue;
    if (p.slideit?.tags) { Object.assign(out, p.slideit.tags); continue; }
    try {
      const mod = await import(pathToFileURL(p.file).href);
      for (const [name, t] of Object.entries((mod.default?.tags ?? {}) as Record<string, TagDef>)) out[name] = { doc: t.doc, attrs: t.attrs, raw: t.raw, empty: t.empty };
    } catch { /* a plugin that needs a browser: its tags stay unknown here */ }
  }
  return out;
}
