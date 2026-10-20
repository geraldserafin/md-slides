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
    const s = parse('<slide>\n  layout: cover\n  --accent: #f00\n  # comment\n</slide>\n<h1>T</h1>');
    expect(s.meta).toEqual({ layout: 'cover', '--accent': '#f00' });
    expect(s.title).toBe('T');
  });
  it('<notes> are the presenter notes', () => {
    expect(parse('<p>text</p>\n<notes>\n  say <b>this</b>\n</notes>').notes).toEqual(['say <b>this</b>']);
  });
});

describe('text tags', () => {
  const html = (src: string) => sectionItems(parse(src).sections[0]).map((i) => (i.kind === 'html' ? i.html : i.kind));
  it('one item per block tag, with the tag kind', () => {
    const s = parse('<h1>Title</h1><p>Text</p><ul><li>a</li><li>b</li></ul><quote>q</quote>');
    expect(sectionItems(s.sections[0]).map((i) => (i.kind === 'html' ? i.tag : i.kind))).toEqual(['h1', 'paragraph', 'list', 'blockquote']);
  });
  it('inline tags become HTML', () => {
    expect(html('<p>a <b>b</b> <i>i</i> <c>x < y</c> <s>s</s> <a href="#top">l</a><br /></p>')).toEqual(['<p>a <strong>b</strong> <em>i</em> <code>x &lt; y</code> <del>s</del> <a href="#top">l</a><br></p>']);
  });
  it('links resolve against the slide', () => {
    expect(html('<p><a href="a.pdf">x</a></p>')[0]).toContain('href="http://x/d/a.pdf"');
  });
  it('text is escaped, entities stay', () => {
    expect(html('<p>1 < 2 & 3 &lt; 4 &#39;</p>')).toEqual(['<p>1 &lt; 2 &amp; 3 &lt; 4 &#39;</p>']);
  });
  it('tables', () => {
    expect(html('<table><tr><th>a</th></tr><tr><td>b</td></tr></table>')[0]).toBe('<table><tr><th>a</th></tr><tr><td>b</td></tr></table>');
  });
  it('the title is the first heading', () => {
    expect(parse('<p>x</p><h2>The <b>title</b></h2>').title).toBe('The title');
  });
  it('text outside a tag and unknown inline tags are errors', () => {
    expect(() => parse('loose words')).toThrow(/text outside a tag/);
    expect(() => parse('<p>a <blink>b</blink></p>')).toThrow(/not allowed inside text/);
  });
  it('math: <tex> inline in a paragraph, display on its own', () => {
    const items = sectionItems(parse('<p>Euler <tex>e^{i\\pi}</tex></p><tex>\\frac{a}{b}</tex>').sections[0]);
    expect(items[0]).toMatchObject({ kind: 'html' });
    expect((items[0] as { html: string }).html).toContain('class="katex"');
    expect((items[1] as { html: string }).html).toContain('math-block');
  });
});

describe('media and code', () => {
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

describe('sections; what is outside them stays', () => {
  it('<section>s swap under the content outside them', () => {
    const s = parse('<h1>Title</h1><p>intro</p><section><h2>A</h2></section><section><h2>B</h2></section>');
    expect(s.head).toHaveLength(2);
    expect(s.sections).toHaveLength(2);
    expect(s.title).toBe('Title');
  });
  it('a heading does not split a slide', () => {
    expect(parse('<h2>A</h2><p>text</p><h2>B</h2>').sections).toHaveLength(1);
  });
});

describe('layout: row = parts side by side, col = parts stacked', () => {
  const code = '<code lang=ts>a;</code>';
  it('text left, code right', () => {
    expect(shape(parse(`<row><p>left</p>${code}</row>`).sections[0].layout)).toEqual({ col: [{ row: ['html', 'block'] }] });
  });
  it('a title over two columns; a col groups several things into one part', () => {
    const s = parse('<h2>T</h2><row><col><p>a</p><img src=x.png /></col><p>b</p></row>');
    expect(shape(s.sections[0].layout)).toEqual({ col: ['html', { row: [{ col: ['html', 'image'] }, 'html'] }] });
  });
  it('a 2x2 grid', () => {
    const s = parse('<col><row><p>a</p><p>b</p></row><row><p>c</p><p>d</p></row></col>');
    expect(shape(s.sections[0].layout)).toEqual({ col: [{ col: [{ row: ['html', 'html'] }, { row: ['html', 'html'] }] }] });
  });
  it('size, halign and valign are kept', () => {
    const s = parse('<row><col size=2 valign=center><p>a</p></col><p halign=end>b</p></row>');
    const row = (s.sections[0].layout as { children: Layout[] }).children[0] as { children: Layout[] };
    expect(row.children[0]).toMatchObject({ kind: 'col', opts: { size: '2', valign: 'center' } });
    expect(row.children[1]).toMatchObject({ kind: 'col', opts: { halign: 'end' } });
  });
});

describe('click numbers', () => {
  it('<step> makes what is inside appear on the next click', () => {
    const t = parse('<p>first</p><step><p>second</p></step><step><p>third</p></step>');
    expect(t.sections[0].stages).toBe(3);
    expect(sectionItems(t.sections[0]).map((i) => i.at)).toEqual([0, 1, 2]);
  });
  it('<step at=3> jumps to an absolute click; what follows is back at the start', () => {
    const t = parse('<p>a</p><step at=3><p>b</p></step><p>c</p>');
    expect(sectionItems(t.sections[0]).map((i) => i.at)).toEqual([0, 3, 0]);
    expect(t.sections[0].stages).toBe(4);
  });
  it('steps in a row appear one part at a time', () => {
    const t = parse('<row><p>a</p><step><p>b</p></step></row>');
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
  it('<ul steps> shows one bullet per click', () => {
    const t = parse('<p>intro</p><ul steps><li>a</li><li>b</li><li>c</li></ul><p>after</p>');
    expect(sectionItems(t.sections[0]).map((i) => i.at)).toEqual([0, 1, 2, 3, 0]);
    expect(t.sections[0].stages).toBe(4);
  });
  it('<ol steps> keeps the numbers', () => {
    const t = parse('<ol steps><li>a</li><li>b</li></ol>');
    expect(sectionItems(t.sections[0]).map((i) => (i.kind === 'html' ? i.html : ''))[1]).toContain('start="2"');
  });
});

describe('per-element animation', () => {
  it('attributes set fx; id is the morph id; at and out reach the stages', () => {
    const s = parse('<p anim=zoom delay=0.2 at=2 out=4 id=note>Two</p>');
    const [item] = sectionItems(s.sections[0]);
    expect(item.fx).toEqual({ anim: 'zoom', delay: '0.2', out: '4', morph: 'note' });
    expect(item.at).toBe(2);
    expect(s.sections[0].stages).toBe(5);
  });
  it('a <step> passes its animation to what is inside', () => {
    const [item] = sectionItems(parse('<step anim=fade><p>x</p></step>').sections[0]);
    expect(item.fx).toEqual({ anim: 'fade' });
  });
});

describe('errors say where', () => {
  it('unknown tag', () => expect(() => parse('<p>a</p>\n<div>x</div>')).toThrow(/line 2: <div>/));
  it('unclosed tag', () => expect(() => parse('<row>\n<p>a</p>')).toThrow(/line 1: <row> is never closed/));
  it('stray closing tag', () => expect(() => parse('<p>a</p></row>')).toThrow(/closes nothing/));
  it('unclosed raw tag', () => expect(() => parse('<code lang=ts>x')).toThrow(/never closed/));
});

describe('autoplay code', () => {
  it('the frames of an autoplay block take no clicks', () => {
    const t = parse('<code lang=ts autoplay=1 loop><frame>1;</frame><frame>2;</frame><frame>3;</frame></code>');
    expect(t.sections[0].blocks[0].frames.map((f) => f.at)).toEqual([0, 0, 0]);
    expect(t.sections[0].stages).toBe(1);
    expect(t.sections[0].blocks[0].opts).toMatchObject({ autoplay: '1', loop: 'true' });
  });
});
