// Assembles deck folders (.slides files + assets, deck.json optional) into <publicDir>/decks/<name>/
// with manifests and an index.json.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { loadLib } from './viewer.mjs';

/** the gallery's own config + assets: hub.json and everything next to it that is not a deck, copied to decks/_hub/ */
function stageHub(hubDir, deckDirs, out) {
  const file = join(hubDir, 'hub.json');
  if (!existsSync(file)) throw new Error(`no hub.json in: ${hubDir}`);
  const dest = join(out, '_hub');
  mkdirSync(dest, { recursive: true });
  const decks = new Set(deckDirs.map((d) => resolve(d)));
  for (const e of readdirSync(hubDir, { withFileTypes: true })) {
    const src = join(hubDir, e.name);
    if (decks.has(resolve(src)) || /^(node_modules|\.git)$/.test(e.name)) continue;
    cpSync(src, join(dest, e.name), { recursive: true });
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** the plugins of a deck: files in the deck folder go along with it; an npm package is copied into _plugins/ */
async function stagePlugins(dir, dest, meta) {
  const { resolvePlugin } = await loadLib('node/loader');
  return (meta.plugins ?? []).map((entry) => {
    const p = resolvePlugin(dir, entry);
    if (!p) throw new Error(`plugin not found: ${entry} (npm install it next to the deck, or use ./file.js)`);
    if (!p.root) return entry;
    const name = entry.replace(/[@/]/g, '_');
    cpSync(p.root, join(dest, '_plugins', name), { recursive: true, filter: (s) => !/(^|[\\/])(node_modules|\.git)([\\/]|$)/.test(relative(p.root, s)) });
    return `_plugins/${name}/${relative(p.root, p.file).split('\\').join('/')}`;
  });
}

export async function stageDecks(dirs, publicDir, hubDir) {
  const { readDeckMeta } = await loadLib('node/loader');
  const out = join(publicDir, 'decks');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const decks = [];
  for (const dir of dirs.map((d) => resolve(d))) {
    if (!existsSync(dir)) throw new Error(`deck folder not found: ${dir}`);
    const name = basename(dir);
    const dest = join(out, name);
    cpSync(dir, dest, { recursive: true, filter: (s) => !/(^|\/)(node_modules|\.git)(\/|$)/.test(s) });
    const files = readdirSync(dir).filter((f) => f.endsWith('.slides')).sort();
    if (!files.length) throw new Error(`no .slides files in folder: ${dir}${readdirSync(dir).some((f) => f.endsWith('.slide')) ? ' (it has .slide files: the old tag format; convert it with `slides migrate <folder>`)' : ''}`);
    const meta = readDeckMeta(dir);
    const plugins = meta.plugins ? await stagePlugins(dir, dest, meta) : undefined;
    writeFileSync(join(dest, 'manifest.json'), JSON.stringify({ title: name, ...meta, ...(plugins ? { plugins } : {}), files }, null, 2));
    decks.push({ name, title: meta.title ?? name, description: meta.description, author: meta.author, date: meta.date, hidden: meta.hidden, thumbnail: meta.thumbnail, order: meta.order ?? 100 });
  }
  decks.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const hub = hubDir ? stageHub(resolve(hubDir), dirs, out) : undefined;
  writeFileSync(join(out, 'index.json'), JSON.stringify({ decks, hub }, null, 2));
  return decks;
}
