// Regression fixtures for the GumTree matcher: each folder has old.<ext>, new.<ext> and
// expect.txt. Directives:
//   M <oldLine> <text> <newLine> <text>   these two leaves must be matched
//   U <oldLine> <text> [nth]              this old leaf must stay unmatched
//   V <newLine> <text> [nth]              this new leaf must stay unmatched
//   NOFUNCS                               no function_definition may be matched
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { flatten, match, type Tree } from '../src/gumtree';
import { langFromTag, parseOne } from '../src/parse';
import { setupNodeGrammars } from './nodeGrammars';

const FIXTURES = join(__dirname, 'fixtures');

beforeAll(setupNodeGrammars);

const lineOf = (src: string, t: Tree) => 1 + (src.slice(0, t.start).match(/\n/g)?.length ?? 0);
const findLeaf = (src: string, root: Tree, line: number, text: string, nth = 1) =>
  flatten(root).filter((t) => t.children.length === 0 && t.text === text && lineOf(src, t) === line)[nth - 1];

describe('match regression fixtures', () => {
  for (const name of readdirSync(FIXTURES).sort()) {
    it(name, async () => {
      const dir = join(FIXTURES, name);
      const files = readdirSync(dir);
      const oldF = files.find((f) => f.startsWith('old.'))!;
      const newF = files.find((f) => f.startsWith('new.'))!;
      const lang = langFromTag(extname(oldF).slice(1))!;
      const oldSrc = readFileSync(join(dir, oldF), 'utf8');
      const newSrc = readFileSync(join(dir, newF), 'utf8');
      const t1 = await parseOne(lang, oldSrc);
      const t2 = await parseOne(lang, newSrc);
      const m = match(t1, t2);
      const matched2 = new Set(m.values());

      const lines = readFileSync(join(dir, 'expect.txt'), 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !l.startsWith('#'));
      for (const l of lines) {
        const w = l.split(/\s+/);
        if (w[0] === 'M') {
          const a = findLeaf(oldSrc, t1, +w[1], w[2]);
          const b = findLeaf(newSrc, t2, +w[3], w[4]);
          expect(a && b && m.get(a.id) === b.id, l).toBe(true);
        } else if (w[0] === 'U') {
          const a = findLeaf(oldSrc, t1, +w[1], w[2], +(w[3] ?? 1));
          expect(a && !m.has(a.id), l).toBe(true);
        } else if (w[0] === 'V') {
          const b = findLeaf(newSrc, t2, +w[1], w[2], +(w[3] ?? 1));
          expect(b && !matched2.has(b.id), l).toBe(true);
        } else if (w[0] === 'NOFUNCS') {
          const bad = flatten(t1).filter((t) => t.label === 'function_definition' && m.has(t.id));
          expect(bad.length, l).toBe(0);
        }
      }
    });
  }
});
