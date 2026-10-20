import { describe, expect, it } from 'vitest';
import { check } from '../src/check';
import { TAGS, childrenOf } from '../src/schema';

const msgs = (src: string) => check(src).map((p) => p.message);

describe('slides check', () => {
  it('a good slide has no problems', () => {
    expect(msgs('<h2>T</h2><row><p>a</p><code lang=ts><frame>1;</frame></code></row><step><ul steps><li>x</li></ul></step>')).toEqual([]);
  });
  it('finds unknown tags, attributes and values', () => {
    expect(msgs('<div>x</div>')[0]).toMatch(/unknown tag <div>/);
    expect(msgs('<p foo=1>a</p>')[0]).toMatch(/unknown attribute `foo`/);
    expect(msgs('<p anim=bogus>a</p>')[0]).toMatch(/expected fade/);
    expect(msgs('<step at=x><p>a</p></step>')[0]).toMatch(/expected a number/);
  });
  it('finds tags in the wrong place and stray text', () => {
    expect(msgs('<row><li>x</li></row>')[0]).toMatch(/not allowed inside <row>/);
    expect(msgs('<ul><p>x</p></ul>')[0]).toMatch(/not allowed inside <ul>/);
    expect(msgs('loose')[0]).toMatch(/text outside a tag/);
  });
  it('finds missing required attributes', () => {
    expect(msgs('<code>x</code>')[0]).toMatch(/needs a `lang`/);
    expect(msgs('<img />')[0]).toMatch(/needs a `src`/);
  });
  it('checks the keys and values of <slide>', () => {
    expect(msgs('<slide>\n  theme: dark\n  halign: center\n  --my-var: 1\n</slide>')).toEqual([]);
    expect(msgs('<slide>\n  bogus: 1\n</slide>')[0]).toMatch(/unknown setting `bogus`/);
    expect(check('<slide>\n  halign: middle\n</slide>')).toEqual([{ line: 2, message: 'halign: expected start | center | end, got `middle`' }]);
  });
  it('reports parse errors with their line', () => {
    expect(check('<p>a</p>\n<row>')).toEqual([{ line: 2, message: '<row> is never closed' }]);
  });
});

describe('schema', () => {
  it('every tag a tag lists exists', () => {
    for (const t of Object.keys(TAGS)) for (const c of childrenOf(t)) expect(TAGS[c], `${t} > ${c}`).toBeDefined();
  });
});
