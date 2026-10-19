// Assembles deck folders (.md + assets + deck.json) into <publicDir>/decks/<name>/
// with manifests and an index.json.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export function stageDecks(dirs, publicDir) {
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
    decks.push({ name, title: meta.title ?? name });
  }
  writeFileSync(join(out, 'index.json'), JSON.stringify({ decks }, null, 2));
  return decks;
}
