import { describe, expect, it } from 'vitest';
import { parseSlide, splitFrontMatter } from '../src/deck';
import { deckStats } from '../src/gallery';

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

describe('deckStats', () => {
  it('counts slides, steps (frames) and languages without parsing', () => {
    const a = parseSlide('# A\n', 'http://x/a.md');
    const b = parseSlide('```ts\n1\n```\n\n```ts\n2\n```\n\n## Next\n\n```py\n3\n```\n', 'http://x/b.md');
    const st = deckStats({ name: 'd', meta: { files: [] }, slides: [a, b] });
    expect(st).toEqual({ slides: 2, steps: 4, langs: ['TypeScript', 'Python'] });
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
