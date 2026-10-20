import { describe, expect, it } from 'vitest';
import { parseSlide, resolveRefs, sectionItems, type Layout } from '../src/deck';
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

const parse = (src: string) => parseSlide(src, 'http://x/d/s.slide');
const shape = (l: Layout): unknown => (l.kind === 'item' ? l.item.kind : { [l.kind]: l.children.map(shape) });

describe('slide settings and notes', () => {
  it('<slide> holds key: value lines', () => {
    const s = parse('<slide>\n  layout: cover\n  --accent: #f00\n  # comment\n</slide>\n# T');
    expect(s.meta).toEqual({ layout: 'cover', '--accent': '#f00' });
    expect(s.title).toBe('T');
  });
  it('<notes> are the presenter notes', () => {
    expect(parse('text\n<notes>\n  say <b>this</b>\n</notes>').notes).toEqual(['say <b>this</b>']);
  });
});

describe('text, media, code', () => {
  it('loose text and <text> are Markdown, one item per block', () => {
    const s = parse('# Title\n\nText\n<text>\n- a\n- b\n</text>');
    expect(sectionItems(s.sections[0]).map((i) => (i.kind === 'html' ? i.tag : i.kind))).toEqual(['h1', 'paragraph', 'list']);
  });
  it('images resolve against the slide and keep class and options', () => {
    const img = sectionItems(parse('<img src=a.png alt=x class="left wide" width=50% />').sections[0])[0];
    expect(img).toMatchObject({ kind: 'image', src: 'http://x/d/a.png', alt: 'x', attrs: { classes: ['left', 'wide'], opts: { width: '50%' } } });
  });
  it('video and audio', () => {
    const items = sectionItems(parse('<video src=c.mp4 autoplay loop /><audio src=t.mp3 />').sections[0]);
    expect(items[0]).toMatchObject({ kind: 'video', attrs: { opts: { autoplay: 'true', loop: 'true' } } });
    expect(items[1].kind).toBe('audio');
  });
  it('code is raw: < and & need no escaping', () => {
    const s = parse('<code lang=ts>\n  const a: Array<number> = [1 < 2 && 3];\n</code>');
    expect(s.sections[0].blocks[0].frames[0].code).toBe('const a: Array<number> = [1 < 2 && 3];');
  });
  it('frames are the states of one block; options, id and class come from the tag', () => {
    const s = parse('<code lang=rust id=fn class="lines panel" start=10 title="my file.rs" focus=2>\n<frame>\n  a;\n  b;\n</frame>\n<frame focus=1-2 transition=fade>\n  a;\n</frame>\n</code>');
    const b = s.sections[0].blocks[0];
    expect(b).toMatchObject({ id: 'fn', explicit: true, lang: 'rust', classes: ['lines', 'panel'], opts: { start: '10', title: 'my file.rs' } });
    expect(b.frames.map((f) => [f.code, f.focus, f.transition, f.at])).toEqual([['a;\nb;', '2', undefined, 0], ['a;', '1-2', 'fade', 1]]);
  });
  it('code tags are independent unless they share an id', () => {
    const t = parse('<code lang=ts>a;</code><code lang=ts>b;</code><code lang=ts id=x>c;</code><code lang=ts id=x>d;</code>');
    expect(t.sections[0].blocks.map((b) => b.frames.length)).toEqual([1, 1, 1, 1]);
    expect(t.sections[0].blocks.map((b) => b.explicit)).toEqual([false, false, true, true]);
  });
  it('a language without a grammar is a static block', () => {
    const t = parse('<code lang=yaml-x>a: 1</code>');
    expect(sectionItems(t.sections[0])[0].kind).toBe('code');
    expect(t.sections[0].blocks).toEqual([]);
  });
  it('\\</code> writes a closing tag inside a raw tag', () => {
    expect(parse('<code lang=html-x>\n  <code>x\\</code>\n</code>').sections[0].blocks).toEqual([]);
    expect(sectionItems(parse('<code lang=html-x>\n  <code>x\\</code>\n</code>').sections[0])[0]).toMatchObject({ text: '<code>x</code>' });
  });
  it('<code from=id /> copies the last frame of the earlier block', () => {
    const a = parse('<code lang=ts id=k><frame>1;</frame><frame>2;</frame></code>');
    const b = parse('<code from=k />');
    resolveRefs([a, b]);
    expect(b.sections[0].blocks[0]).toMatchObject({ lang: 'typescript', frames: [{ code: '2;' }] });
  });
  it('<chart> and <diagram> are raw', () => {
    const s = parse('<chart type=bar title="T">\na, b\nx, 1\n</chart><diagram>graph LR; A-->B</diagram>');
    const items = sectionItems(s.sections[0]);
    expect(items[0]).toMatchObject({ kind: 'html', tag: 'chart' });
    expect(items[1]).toMatchObject({ kind: 'diagram', text: 'graph LR; A-->B' });
  });
});

describe('sections and the head', () => {
  it('<section>s swap under a <head>', () => {
    const s = parse('<head># Title\n\nintro</head><section>## A\ntext</section><section>## B\nmore</section>');
    expect(s.head).toHaveLength(2);
    expect(s.sections).toHaveLength(2);
    expect(s.title).toBe('Title');
  });
  it('a heading does not split a slide', () => {
    expect(parse('## A\ntext\n## B\nmore').sections).toHaveLength(1);
  });
  it('content outside the sections is an error', () => {
    expect(() => parse('stray<section>a</section>')).toThrow(/outside a <section>/);
  });
});

describe('layout: row = parts side by side, col = parts stacked', () => {
  const code = '<code lang=ts>a;</code>';
  it('text left, code right', () => {
    expect(shape(parse(`<row>left \n${code}</row>`).sections[0].layout)).toEqual({ col: [{ row: ['html', 'block'] }] });
  });
  it('a title over two columns, a col groups several things into one part', () => {
    const s = parse('## T\n<row><col>a<img src=x.png /></col>b</row>');
    expect(shape(s.sections[0].layout)).toEqual({ col: ['html', { row: [{ col: ['html', 'image'] }, 'html'] }] });
  });
  it('a 2x2 grid', () => {
    const s = parse('<col><row>a<text>b</text></row><row><text>c</text><text>d</text></row></col>');
    expect(shape(s.sections[0].layout)).toEqual({ col: [{ col: [{ row: ['html', 'html'] }, { row: ['html', 'html'] }] }] });
  });
  it('size, halign and valign are kept', () => {
    const s = parse('<row><col size=2 valign=center>a</col><text halign=end>b</text></row>');
    const row = (s.sections[0].layout as { children: Layout[] }).children[0] as { children: Layout[] };
    expect(row.children[0]).toMatchObject({ kind: 'col', opts: { size: '2', valign: 'center' } });
  });
  it('a loose text run in a row is one part', () => {
    const s = parse('<row># A\n\ntext<code lang=ts>x;</code></row>');
    expect(shape(s.sections[0].layout)).toEqual({ col: [{ row: [{ col: ['html', 'html'] }, 'block'] }] });
  });
});

describe('click numbers', () => {
  it('<step> makes what is inside appear on the next click', () => {
    const t = parse('first<step>second</step><step>third</step>');
    expect(t.sections[0].stages).toBe(3);
    expect(sectionItems(t.sections[0]).map((i) => i.at)).toEqual([0, 1, 2]);
  });
  it('<step at=3> jumps to an absolute click; what follows is back at the start', () => {
    const t = parse('a<step at=3>b</step>c');
    expect(sectionItems(t.sections[0]).map((i) => i.at)).toEqual([0, 3, 0]);
    expect(t.sections[0].stages).toBe(4);
  });
  it('steps in a row appear one part at a time', () => {
    const t = parse('<row>a<step>b</step></row>');
    expect(sectionItems(t.sections[0]).map((i) => i.at)).toEqual([0, 1]);
  });
  it('the frames of a block take a click each; at= says which', () => {
    const t = parse('<code lang=ts><frame>1;</frame><frame>2;</frame><frame at=5>3;</frame></code>');
    expect(t.sections[0].blocks[0].frames.map((f) => f.at)).toEqual([0, 1, 5]);
    expect(t.sections[0].stages).toBe(6);
  });
  it('a block inside a <step> starts on its click', () => {
    const t = parse('<step><code lang=ts><frame>1;</frame><frame>2;</frame></code></step>');
    expect(t.sections[0].blocks[0].frames.map((f) => f.at)).toEqual([1, 2]);
  });
  it('<text steps> turns a list into one click per bullet', () => {
    const t = parse('intro<text steps>\n- a\n- b\n- c\n</text>after');
    expect(sectionItems(t.sections[0]).map((i) => i.at)).toEqual([0, 1, 2, 3, 0]);
    expect(t.sections[0].stages).toBe(4);
  });
});

describe('math', () => {
  it('renders inline and display math, but leaves prices alone', () => {
    const s = parse('Euler $e^{i\\pi}$ costs $5 and $6.\n\n$$\n\\frac{a}{b}\n$$\n');
    const html = sectionItems(s.sections[0]).map((i) => (i.kind === 'html' ? i.html : '')).join('');
    expect(html).toContain('class="katex"');
    expect(html).toContain('math-block');
    expect(html).toContain('costs $5 and $6');
  });
});

describe('per-element animation', () => {
  it('attributes set fx; id is the morph id; at and out reach the stages', () => {
    const s = parse('<text anim=zoom delay=0.2 at=2 out=4 id=note>Two</text>');
    const [item] = sectionItems(s.sections[0]);
    expect(item.fx).toEqual({ anim: 'zoom', delay: '0.2', out: '4', morph: 'note' });
    expect(item.at).toBe(2);
    expect(s.sections[0].stages).toBe(5);
  });
  it('a <step> passes its animation to what is inside', () => {
    const [item] = sectionItems(parse('<step anim=fade>x</step>').sections[0]);
    expect(item.fx).toEqual({ anim: 'fade' });
  });
});

describe('errors say where', () => {
  it('unknown tag', () => expect(() => parse('a\n<div>x</div>')).toThrow(/line 2: <div>/));
  it('unclosed tag', () => expect(() => parse('<row>\na')).toThrow(/line 1: <row> is never closed/));
  it('stray closing tag', () => expect(() => parse('a</row>')).toThrow(/closes nothing/));
  it('unclosed raw tag', () => expect(() => parse('<code lang=ts>x')).toThrow(/never closed/));
});

describe('layout attributes on a <text>', () => {
  it('size, halign and valign make its blocks one part', () => {
    const s = parseSlide('<row><text size=2 valign=end># A\n\nb</text>c</row>', 'http://x/s.slide');
    const row = (s.sections[0].layout as { children: Layout[] }).children[0] as { children: Layout[] };
    expect(row.children[0]).toMatchObject({ kind: 'col', opts: { size: '2', valign: 'end' } });
    expect((row.children[0] as { children: Layout[] }).children).toHaveLength(2);
  });
});
