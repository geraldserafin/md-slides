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
  const md = '---\nlayout: side\n---\n# Title\n\nText\n\n![a](img.png){.left width=50%}\n\n```ts .left size=18\nlet a = 1;\n```\n\n```ts .left size=18\nlet a = 2;\n```\n\n<!-- note -->\n';
  const s = parseSlide(md, 'http://x/d/s.md');
  it('section with frames, media and notes', () => {
    expect(s.meta.layout).toBe('side');
    expect(s.title).toBe('Title');
    expect(s.notes).toEqual(['note']);
    expect(s.sections).toHaveLength(1);
    expect(s.sections[0].codes).toEqual(['let a = 1;', 'let a = 2;']);
    expect(s.sections[0].opts.size).toBe('18');
    const img = s.sections[0].items.find((i) => i.kind === 'image');
    expect(img).toMatchObject({ src: 'http://x/d/img.png', attrs: { classes: ['left'], opts: { width: '50%' } } });
  });
  it('per-frame focus option', () => {
    const s = parseSlide('```ts focus=2\na;\nb;\n```\n\n```ts focus=1-2,4\na;\nb;\n```\n', 'http://x/s.md');
    expect(s.sections[0].codes).toHaveLength(2);
    expect(s.sections[0].focus).toEqual(['2', '1-2,4']);
  });
  it('video by extension', () => {
    const v = parseSlide('![](clip.mp4){autoplay loop}\n', 'http://x/d/s.md').sections[0].items[0];
    expect(v).toMatchObject({ kind: 'video', attrs: { opts: { autoplay: 'true', loop: 'true' } } });
  });
  it('language without a grammar = static block', () => {
    const t = parseSlide('```yaml-x\na: 1\n```\n', 'http://x/s.md');
    expect(t.sections[0].items[0].kind).toBe('code');
    expect(t.sections[0].codes).toEqual([]);
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
  const texts = (items: { kind: string; html?: string }[]) => items.map((i) => (i.html ?? '').replace(/<[^>]+>|\n/g, ''));

  it('text left, code right', () => {
    const s = parse('## T\n\nleft\n\n---\n\n```ts\na;\n```\n');
    expect(s.sections).toHaveLength(1);
    expect(texts(s.sections[0].items)).toEqual(['T', 'left']);
    expect(s.sections[0].right).toEqual([]);
    expect(s.sections[0].codeCol).toBe(1);
  });

  it('code left, text right', () => {
    const s = parse('```ts\na;\n```\n\n---\n\n## Right\n\nmore\n');
    expect(s.sections).toHaveLength(1);
    expect(s.sections[0].codeCol).toBe(0);
    expect(texts(s.sections[0].right ?? [])).toEqual(['Right', 'more']);
  });

  it('text in both columns, no code', () => {
    const s = parse('left\n\n---\n\nright\n');
    expect(s.sections).toHaveLength(1);
    expect(texts(s.sections[0].items)).toEqual(['left']);
    expect(texts(s.sections[0].right ?? [])).toEqual(['right']);
    expect(s.sections[0].hasFence).toBe(false);
  });

  it('frames keep merging on the code side', () => {
    const s = parse('text\n\n---\n\n```ts\na;\n```\n\n```ts\nb;\n```\n');
    expect(s.sections).toHaveLength(1);
    expect(s.sections[0].codes).toEqual(['a;', 'b;']);
  });

  it('no --- means one column', () => {
    const s = parse('text\n\n```ts\na;\n```\n');
    expect(s.sections[0].right).toBeUndefined();
    expect(s.sections[0].codeCol).toBe(0);
  });

  it('the old layout: side still gives text left, code right', () => {
    const s = parse('---\nlayout: side\n---\n\ntext\n\n```ts\na;\n```\n');
    expect(s.sections[0].right).toEqual([]);
    expect(s.sections[0].codeCol).toBe(1);
  });
});
