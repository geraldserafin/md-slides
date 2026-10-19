import { describe, expect, it } from 'vitest';
import { parseSlide, splitFrontMatter } from '../src/deck';

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
    const img = s.sections[0].items.find((i) => i.kind === 'image');
    expect(img).toMatchObject({ src: 'http://x/d/img.png', attrs: { classes: ['left'], opts: { width: '50%' } } });
  });
  it('code blocks are independent unless they share an id', () => {
    const t = parseSlide('```ts\na;\n```\n\n```ts\nb;\n```\n\n```ts #x\nc;\n```\n\n```ts #x\nd;\n```\n', 'http://x/s.md');
    expect(t.sections[0].blocks.map((b) => b.frames.length)).toEqual([1, 1, 2]);
    expect(t.sections[0].items.filter((i) => i.kind === 'block')).toHaveLength(3);
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
    const v = parseSlide('![](clip.mp4){autoplay loop}\n', 'http://x/d/s.md').sections[0].items[0];
    expect(v).toMatchObject({ kind: 'video', attrs: { opts: { autoplay: 'true', loop: 'true' } } });
  });
  it('language without a grammar = static block', () => {
    const t = parseSlide('```yaml-x\na: 1\n```\n', 'http://x/s.md');
    expect(t.sections[0].items[0].kind).toBe('code');
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
    expect(t.sections[0].items.map((i) => i.at)).toEqual([0, 1, 2]);
  });
  it('frames of a group take a click each; a +++ before one does not add another', () => {
    const t = parse('```ts #a\n1;\n```\n\n```ts #a\n2;\n```\n\n+++\n\n```ts #a\n3;\n```\n');
    expect(t.sections[0].blocks[0].frames.map((f) => f.at)).toEqual([0, 1, 2]);
    expect(t.sections[0].stages).toBe(3);
  });
  it('a block can appear on a later click', () => {
    const t = parse('text\n\n+++\n\n```ts\na;\n```\n');
    expect(t.sections[0].items.map((i) => [i.kind, i.at])).toEqual([['html', 0], ['block', 1]]);
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

describe('columns (a --- line)', () => {
  const parse = (md: string) => parseSlide(md, 'http://x/s.md');
  const kinds = (items: { kind: string }[] = []) => items.map((i) => i.kind);

  it('text left, code right', () => {
    const s = parse('## T\n\nleft\n\n---\n\n```ts\na;\n```\n');
    expect(s.sections).toHaveLength(1);
    expect(kinds(s.sections[0].items)).toEqual(['html', 'html']);
    expect(kinds(s.sections[0].right)).toEqual(['block']);
  });

  it('code left, text right', () => {
    const s = parse('```ts\na;\n```\n\n---\n\n## Right\n\nmore\n');
    expect(s.sections).toHaveLength(1);
    expect(kinds(s.sections[0].items)).toEqual(['block']);
    expect(kinds(s.sections[0].right)).toEqual(['html', 'html']);
  });

  it('text in both columns, no code', () => {
    const s = parse('left\n\n---\n\nright\n');
    expect(kinds(s.sections[0].items)).toEqual(['html']);
    expect(kinds(s.sections[0].right)).toEqual(['html']);
    expect(s.sections[0].blocks).toHaveLength(0);
  });

  it('no --- means one column', () => {
    const s = parse('text\n\n```ts\na;\n```\n');
    expect(s.sections[0].right).toBeUndefined();
  });

  it('the old layout: side puts the code right', () => {
    const s = parse('---\nlayout: side\n---\n\ntext\n\n```ts\na;\n```\n');
    expect(kinds(s.sections[0].items)).toEqual(['html']);
    expect(kinds(s.sections[0].right)).toEqual(['block']);
  });
});
