import { beforeAll, describe, expect, it } from 'vitest';
import { flatten } from '../src/plugins/code/gumtree.ts';
import { layoutLeaves } from '../src/plugins/code/layout.ts';
import { parseOne } from '../src/plugins/code/parse.ts';
import { setupNodeGrammars } from './nodeGrammars';

beforeAll(setupNodeGrammars);

const leafTexts = async (lang: string, src: string) =>
  flatten(await parseOne(lang, src)).filter((t) => t.children.length === 0).map((t) => t.text);

describe('parseOne leaves', () => {
  it('keeps text that the grammar leaves un-noded (rust string contents)', async () => {
    const texts = await leafTexts('rust', 'fn f() { println!("Hello, world"); }');
    expect(texts).toContain('Hello, world');
  });

  it('drops whitespace-only leaves (go automatic semicolons)', async () => {
    const texts = await leafTexts('go', 'package main\n\nfunc f() {\n\tx := 1\n}\n');
    expect(texts.every((t) => t.trim() === t && t !== '')).toBe(true);
  });

  it('lays out go code on separate rows', async () => {
    const src = 'func f() {\n    x := 1\n    y := 2\n}\n';
    const rows = new Set(layoutLeaves(src, await parseOne('go', src)).map((p) => p.row));
    expect([...rows].sort()).toEqual([0, 1, 2, 3]);
  });

  it('splits uncovered multi-line text per line', async () => {
    const texts = await leafTexts('rust', 'fn f() { let s = "ab\n   cd"; }');
    expect(texts).toEqual(expect.arrayContaining(['ab', 'cd']));
  });
});
