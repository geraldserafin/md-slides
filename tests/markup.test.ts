import { describe, expect, it } from 'vitest';
import { dedent, parseMarkup, tagAttrs, type El } from '../src/markup';

describe('parseMarkup', () => {
  it('attributes: bare values, quotes, flags, self-closing', () => {
    const [el] = parseMarkup('<img src=a/b.png alt="two words" class=\'x y\' muted />') as El[];
    expect(el).toMatchObject({ tag: 'img', attrs: { src: 'a/b.png', alt: 'two words', class: 'x y', muted: 'true' }, children: [] });
  });
  it('a bare value may end in a slash before >', () => {
    expect((parseMarkup('<img src=a.png/>')[0] as El).attrs.src).toBe('a.png');
  });
  it('nesting and text', () => {
    const [row] = parseMarkup('<row>a<col>b</col></row>') as El[];
    expect(row.children[0]).toBe('a');
    expect((row.children[1] as El).tag).toBe('col');
  });
  it('raw tags keep < and & and nested tags as text', () => {
    const [el] = parseMarkup('<code>if (a < b && <x>) {}</code>') as El[];
    expect(el.children).toEqual(['if (a < b && <x>) {}']);
  });
  it('\\</code> writes the closing tag inside', () => {
    const [el] = parseMarkup('<code>x \\</code> y</code>') as El[];
    expect(el.children).toEqual(['x </code> y']);
  });
  it('a < that starts no tag is text', () => {
    expect(parseMarkup('1 < 2 and 3<4')).toEqual(['1 < 2 and 3<4']);
  });
  it('errors carry the line', () => {
    expect(() => parseMarkup('a\nb\n<row>')).toThrow(/line 3/);
    expect(() => parseMarkup('<img src="x />')).toThrow(/unterminated quote/);
  });
  it('tagAttrs', () => expect(tagAttrs('lang=ts focus="2-4" last')).toEqual({ lang: 'ts', focus: '2-4', last: 'true' }));
});

describe('dedent', () => {
  it('removes the common indent and the blank lines around', () => {
    expect(dedent('\n    a\n      b\n\n    c\n  ')).toBe('a\n  b\n\nc');
  });
  it('keeps tabs', () => expect(dedent('\ta\n\t\tb')).toBe('a\n\tb'));
});
