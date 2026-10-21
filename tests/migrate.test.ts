import { expect, it } from 'vitest';
// @ts-expect-error plain JS, no declarations
import { migrateSource } from '../cli/migrate.mjs';
import { check } from '../src/kernel/check';
import { stockRegistry } from '../src/plugins/index';
import { leaves, one } from './helpers';

const OLD = `<slide>
  layout: cover
  halign: center
  heading-size: 56
</slide>
<h1>Hello <b>world</b></h1>
<p>Use <c>x < y</c> and <a href="https://x.dev">a link</a>, 5 * 3 and snake_case.</p>
<ul steps><li>one</li><li>two<ul><li>nested</li></ul></li></ul>
<row>
  <col size=2><h3>Left</h3><p>text</p></col>
  <code lang=ts id=c focus="1" transition=fade>
    <frame>let a = 1;</frame>
    <frame focus="1">let a = 2;</frame>
  </code>
</row>
<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
<notes>Say this.</notes>`;

it('an old tag deck becomes a deck that checks and compiles', () => {
  const warnings: string[] = [];
  const src = migrateSource(OLD, { name: 'old.slide', warn: (m: string) => warnings.push(m) });
  expect(check(src, stockRegistry())).toEqual([]);
  const s = one(src);
  expect(s.own).toMatchObject({ layout: 'cover', halign: 'center', '--heading-size': '56px' });
  expect(s.notes).toEqual(['Say this.']);
  const els = leaves(s);
  expect(els.map((e) => e.kind)).toEqual(['title', 'text', 'list', 'list', 'subheading', 'text', 'code', 'code', 'table']);
  expect(els.find((e) => e.kind === 'text')!.props.text).toBe('Use `x < y` and [a link](https://x.dev), 5 \\* 3 and snake_case.');
  // the frames are the states of one block, the transition is the swap's
  const codes = els.filter((e) => e.kind === 'code');
  expect(new Set(codes.map((e) => e.key))).toEqual(new Set(['code:@c']));
  expect(codes.map((e) => e.transition)).toEqual(['fade', 'fade']);
  expect(warnings).toEqual([]);
});

it('a section becomes a child of a swap, what is outside the sections stays', () => {
  const src = migrateSource('<h1>Title</h1><section><h2>One</h2></section><section><h2>Two</h2></section>', { name: 'o.slide' });
  expect(check(src, stockRegistry())).toEqual([]);
  const els = leaves(one(src));
  expect(els.map((e) => [e.kind, e.at, e.out])).toEqual([['title', 0, undefined], ['heading', 0, 1], ['heading', 1, undefined]]);
});

it('says what is gone', () => {
  const warnings: string[] = [];
  migrateSource('<p delay=1>x</p><step at=3><p>y</p></step>', { name: 'o.slide', warn: (m: string) => warnings.push(m) });
  expect(warnings.join('\n')).toMatch(/`delay` is gone/);
  expect(warnings.join('\n')).toMatch(/`step at=N` is gone/);
});
