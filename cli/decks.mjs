// Assembles deck folders (.md + assets + deck.json) into <publicDir>/decks/<name>/
// with manifests and an index.json.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

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

export function stageDecks(dirs, publicDir, hubDir) {
  const out = join(publicDir, 'decks');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const decks = [];
  for (const dir of dirs.map((d) => resolve(d))) {
    if (!existsSync(dir)) throw new Error(`deck folder not found: ${dir}`);
    const name = basename(dir);
    const dest = join(out, name);
    cpSync(dir, dest, { recursive: true, filter: (s) => !/(^|\/)(node_modules|\.git)(\/|$)/.test(s) });
    const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
    if (!files.length) throw new Error(`no .md files in folder: ${dir}`);
    const metaPath = join(dir, 'deck.json');
    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
    writeFileSync(join(dest, 'manifest.json'), JSON.stringify({ title: name, ...meta, files }, null, 2));
    decks.push({ name, title: meta.title ?? name, description: meta.description, author: meta.author, date: meta.date, hidden: meta.hidden, thumbnail: meta.thumbnail, order: meta.order ?? 100 });
  }
  decks.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const hub = hubDir ? stageHub(resolve(hubDir), dirs, out) : undefined;
  writeFileSync(join(out, 'index.json'), JSON.stringify({ decks, hub }, null, 2));
  return decks;
}
