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
