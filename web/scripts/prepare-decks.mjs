// Kopiuje foldery z deckami (.md + assety) do public/decks/<nazwa>/ i generuje
// manifesty. Dekki = foldery podane w DECK_DIRS (domyślnie ../slides i
// ../slides-monads) albo w argumentach: node scripts/prepare-decks.mjs ../moj-deck
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { basename, resolve, join } from 'node:path';

const out = resolve('public/decks');
const dirs = (process.argv.length > 2 ? process.argv.slice(2) : ['../slides', '../slides-monads']).map((d) => resolve(d));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const decks = [];
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  const name = basename(dir);
  const dest = join(out, name);
  cpSync(dir, dest, { recursive: true });
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  let meta = {};
  const metaPath = join(dir, 'deck.json');
  if (existsSync(metaPath)) meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  writeFileSync(join(dest, 'manifest.json'), JSON.stringify({ title: name, ...meta, files }, null, 2));
  decks.push({ name, title: meta.title ?? name });
}
writeFileSync(join(out, 'index.json'), JSON.stringify({ decks }, null, 2));
console.log(`decks: ${decks.map((d) => d.name).join(', ')}`);
