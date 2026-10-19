// Porównanie z referencyjną implementacją Haskell: jeśli /tmp/states (zrzut z
// cabal repl, patrz README) istnieje, wyniki 'match' muszą być identyczne.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, beforeAll } from 'vitest';
import { flatten, match } from '../src/gumtree';
import { langFromTag, parseOne } from '../src/parse';
import { setupNodeGrammars } from './nodeGrammars';

const DIR = process.env.PARITY_DIR ?? '/tmp/states';
beforeAll(setupNodeGrammars);

const lc = (src: string, idx: number) => {
  const pre = src.slice(0, idx);
  const nl = pre.lastIndexOf('\n');
  return `(${1 + (pre.match(/\n/g)?.length ?? 0)},${Buffer.byteLength(pre.slice(nl + 1))})`;
};

const names = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.hs.txt')).map((f) => f.replace('.hs.txt', '')) : [];

describe.skipIf(names.length === 0)('haskell parity', () => {
  for (const n of names.sort()) {
    it(n, async () => {
      const oldSrc = readFileSync(`${DIR}/${n}.old`, 'utf8');
      const newSrc = readFileSync(`${DIR}/${n}.new`, 'utf8');
      const tag = readFileSync(`${DIR}/${n}.lang`, 'utf8').trim() === 'Cpp' ? 'cpp' : 'ts';
      const lang = langFromTag(tag)!;
      const t1 = await parseOne(lang, oldSrc);
      const t2 = await parseOne(lang, newSrc);
      const m = match(t1, t2);
      const byId2 = new Map(flatten(t2).map((t) => [t.id, t]));
      const rows = flatten(t1)
        .filter((a) => a.children.length === 0 && m.has(a.id))
        .map((a) => {
          const b = byId2.get(m.get(a.id)!)!;
          return `${lc(oldSrc, a.start)} ${a.label} ${JSON.stringify(a.text)} -> ${lc(newSrc, b.start)}`;
        });
      const hs = readFileSync(`${DIR}/${n}.hs.txt`, 'utf8').split('\n').filter(Boolean);
      expect(rows.sort()).toEqual(hs.sort());
    });
  }
});
