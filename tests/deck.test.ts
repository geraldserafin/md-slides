import { describe, expect, it } from 'vitest';
import { parseSlide, sectionItems, splitFrontMatter } from '../src/deck';

describe('front matter', () => {
  it('parses keys and strips the block', () => {
    const { meta, body } = splitFrontMatter('---\nlayout: side\ntheme: light\n--accent: #f00\n---\n# T\n');
    expect(meta).toEqual({ layout: 'side', theme: 'light', '--accent': '#f00' });
    expect(body).toBe('# T\n');
  });
  it('leaves content alone without front matter', () => {
    expect(splitFrontMatter('# T\n---\nx').meta).toEqual({});
  });
});

describe('parseSlide', () => {
  const md = '# Title\n\nText\n\n![a](img.png){.left width=50%}\n\n```ts .left size=18 #f\nlet a = 1;\n```\n\n```ts .left size=18 #f\nlet a = 2;\n```\n\n<!-- note -->\n';
  const s = parseSlide(md, 'http://x/d/s.md');
  it('section with a code group, media and notes', () => {
    expect(s.title).toBe('Title');
    expect(s.notes).toEqual(['note']);
    expect(s.sections).toHaveLength(1);
    const blocks = s.sections[0].blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0].frames.map((f) => f.code)).toEqual(['let a = 1;', 'let a = 2;']);
    expect(blocks[0].opts.size).toBe('18');
    expect(blocks[0].id).toBe('f');
    expect(blocks[0].explicit).toBe(true);
    const img = sectionItems(s.sections[0]).find((i) => i.kind === 'image');
    expect(img).toMatchObject({ src: 'http://x/d/img.png', attrs: { classes: ['left'], opts: { width: '50%' } } });
  });
  it('code blocks are independent unless they share an id', () => {
    const t = parseSlide('```ts\na;\n```\n\n```ts\nb;\n```\n\n```ts #x\nc;\n```\n\n```ts #x\nd;\n```\n', 'http://x/s.md');
    expect(t.sections[0].blocks.map((b) => b.frames.length)).toEqual([1, 1, 2]);
    expect(sectionItems(t.sections[0]).filter((i) => i.kind === 'block')).toHaveLength(3);
  });
  it('per-frame focus option', () => {
    const t = parseSlide('```ts focus=2 #a\na;\nb;\n```\n\n```ts focus=1-2,4 #a\na;\nb;\n```\n', 'http://x/s.md');
    expect(t.sections[0].blocks[0].frames.map((f) => f.focus)).toEqual(['2', '1-2,4']);
  });
  it('fence info: quoted values, #id and classes', () => {
    const t = parseSlide('```rust #fn .lines .panel start=10 title="my file.rs"\nfn f() {}\n```\n', 'http://x/s.md');
    const bl = t.sections[0].blocks[0];
    expect(bl).toMatchObject({ id: 'fn', lang: 'rust', classes: ['lines', 'panel'], opts: { start: '10', title: 'my file.rs' } });
  });
  it('video by extension', () => {
    const v = sectionItems(parseSlide('![](clip.mp4){autoplay loop}\n', 'http://x/d/s.md').sections[0])[0];
    expect(v).toMatchObject({ kind: 'video', attrs: { opts: { autoplay: 'true', loop: 'true' } } });
  });
  it('language without a grammar = static block', () => {
    const t = parseSlide('```yaml-x\na: 1\n```\n', 'http://x/s.md');
    expect(sectionItems(t.sections[0])[0].kind).toBe('code');
    expect(t.sections[0].blocks).toEqual([]);
  });
});

describe('sections and reveal stages', () => {
  const parse = (md: string) => parseSlide(md, 'http://x/s.md');
  it('a level 1-2 heading after content starts a new section', () => {
    const t = parse('## A\n\ntext\n\n## B\n\nmore\n');
    expect(t.sections).toHaveLength(2);
  });
  it('a heading right after a heading does not', () => {
    expect(parse('# A\n\n## B\n\ntext\n').sections).toHaveLength(1);
  });
  it('+++ makes what follows appear on the next click', () => {
    const t = parse('first\n\n+++\n\nsecond\n\n+++\n\nthird\n');
    expect(t.sections[0].stages).toBe(3);
    expect(sectionItems(t.sections[0]).map((i) => i.at)).toEqual([0, 1, 2]);
  });
  it('frames of a group take a click each; a +++ before one does not add another', () => {
    const t = parse('```ts #a\n1;\n```\n\n```ts #a\n2;\n```\n\n+++\n\n```ts #a\n3;\n```\n');
    expect(t.sections[0].blocks[0].frames.map((f) => f.at)).toEqual([0, 1, 2]);
    expect(t.sections[0].stages).toBe(3);
  });
  it('a block can appear on a later click', () => {
    const t = parse('text\n\n+++\n\n```ts\na;\n```\n');
    expect(sectionItems(t.sections[0]).map((i) => [i.kind, i.at])).toEqual([['html', 0], ['block', 1]]);
  });
});

import { barVisible, expand, isImage, usesSlideNumber } from '../src/chrome';

describe('chrome (header/footer)', () => {
  const ctx = { slide: 3, slides: 10, title: 'Deck', slideTitle: 'Intro', author: 'Ann' };
  it('expands placeholders and leaves unknown ones', () => {
    expect(expand('{slide} / {slides} · {title} · {author} {nope}', ctx)).toBe('3 / 10 · Deck · Ann {nope}');
  });
  it('tells images from text', () => {
    expect(isImage('logo.svg')).toBe(true);
    expect(isImage('assets/Logo.PNG?v=2')).toBe(true);
    expect(isImage('ACME Corp.')).toBe(false);
  });
  it('detects the slide number', () => {
    expect(usesSlideNumber({ right: '{slide}/{slides}' })).toBe(true);
    expect(usesSlideNumber({ left: ['logo.svg', 'ACME'] })).toBe(false);
  });
  it('hides on cover slides and with footer: off', () => {
    const bar = { left: 'x' };
    expect(barVisible(bar, {}, 'footer')).toBe(true);
    expect(barVisible(bar, { layout: 'cover' }, 'footer')).toBe(false);
    expect(barVisible({ ...bar, cover: true }, { layout: 'cover' }, 'footer')).toBe(true);
    expect(barVisible(bar, { layout: 'cover', footer: 'on' }, 'footer')).toBe(true);
    expect(barVisible(bar, { footer: 'off' }, 'footer')).toBe(false);
    expect(barVisible(undefined, {}, 'footer')).toBe(false);
  });
});

describe('grid: rows (---) and cells (|||)', () => {
  const parse = (md: string) => parseSlide(md, 'http://x/s.md');
  const kinds = (items: { kind: string }[] = []) => items.map((i) => i.kind);
  const shape = (md: string) => parse(md).sections[0].rows.map((r) => r.map((c) => kinds(c)));

  it('text left, code right', () => {
    expect(shape('## T\n\nleft\n\n|||\n\n```ts\na;\n```\n')).toEqual([[['html', 'html'], ['block']]]);
  });

  it('code left, text right', () => {
    expect(shape('```ts\na;\n```\n\n|||\n\n## Right\n\nmore\n')).toEqual([[['block'], ['html', 'html']]]);
    expect(parse('```ts\na;\n```\n\n|||\n\n## Right\n').sections).toHaveLength(1);
  });

  it('a 2x2 grid under a title', () => {
    expect(shape('## Title\n\n---\n\na\n\n|||\n\nb\n\n---\n\nc\n\n|||\n\nd\n'))
      .toEqual([[['html']], [['html'], ['html']], [['html'], ['html']]]);
  });

  it('three cells in a row', () => {
    expect(parse('a\n\n|||\n\nb\n\n|||\n\nc\n').sections[0].rows[0]).toHaveLength(3);
  });

  it('a leading --- is ignored', () => {
    expect(shape('---\nlayout: x\n---\n\n---\n\ntext\n')).toEqual([[['html']]]);
  });

  it('no separators: one row, one cell', () => {
    expect(shape('text\n\n```ts\na;\n```\n')).toEqual([[['html', 'block']]]);
  });

  it('the old layout: side puts the code right', () => {
    expect(shape('---\nlayout: side\n---\n\ntext\n\n```ts\na;\n```\n')).toEqual([[['html'], ['block']]]);
  });
});

describe('click numbers (@N)', () => {
  const parse = (md: string) => parseSlide(md, 'http://x/s.md');
  it('@1 puts a frame on click 1 without using up a click', () => {
    const t = parse('```ts #a\n1;\n```\n\n```ts #a @1\n2;\n```\n\n|||\n\n```ts #b\n1;\n```\n\n```ts #b @1\n2;\n```\n');
    expect(t.sections[0].blocks.map((b) => b.frames.map((f) => f.at))).toEqual([[0, 1], [0, 1]]);
    expect(t.sections[0].stages).toBe(2);
  });
  it('+++ N jumps to an absolute click', () => {
    const t = parse('a\n\n+++ 3\n\nb\n');
    expect(sectionItems(t.sections[0]).map((i) => i.at)).toEqual([0, 3]);
    expect(t.sections[0].stages).toBe(4);
  });
});

describe('slide head, cell options, steps lists, grid: N', () => {
  const parse = (md: string) => parseSlide(md, 'http://x/s.md');

  it('a level 1 heading with level 2 sections below is the slide head', () => {
    const s = parse('# Title\n\nintro\n\n## A\n\ntext\n\n## B\n\nmore\n');
    expect(s.head).toHaveLength(2);
    expect(s.sections).toHaveLength(2);
    expect(s.title).toBe('Title');
  });

  it('without level 2 sections the h1 is ordinary content', () => {
    const s = parse('# Title\n\ntext\n');
    expect(s.head).toHaveLength(0);
    expect(s.sections).toHaveLength(1);
  });

  it('||| takes options for the cell that follows', () => {
    const s = parse('a\n\n||| span=2 valign=center\n\nb\n');
    expect(s.sections[0].rows[0]).toHaveLength(2);
    expect(s.sections[0].cellOpts[0]).toEqual([{}, { span: '2', valign: 'center' }]);
  });

  it('||| at the start of an empty cell only sets its options', () => {
    const s = parse('a\n\n---\n\n||| halign=end\n\nb\n');
    expect(s.sections[0].rows.map((r) => r.length)).toEqual([1, 1]);
    expect(s.sections[0].cellOpts[1][0]).toEqual({ halign: 'end' });
  });

  it('{.steps} turns a list into one click per bullet', () => {
    const s = parse('intro\n\n- a\n- b\n- c\n\n{.steps}\n\nafter\n');
    const items = sectionItems(s.sections[0]);
    expect(items.map((i) => i.at)).toEqual([0, 1, 2, 3, 3]);
    expect(s.sections[0].stages).toBe(4);
  });

  it('grid: N wraps cells into rows of N', () => {
    const s = parse('---\ngrid: 2\n---\n\na\n\n|||\n\nb\n\n|||\n\nc\n\n|||\n\nd\n\n|||\n\ne\n');
    expect(s.sections[0].rows.map((r) => r.length)).toEqual([2, 2, 1]);
  });
});
