import { describe, expect, it } from 'vitest';
import { parseSlides, resolveRefs, sectionItems, type Layout, type Slide } from '../src/deck';
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

const slides = (src: string): Slide[] => parseSlides(src, 'http://x/d/s.slides').slides;
const one = (src: string) => slides(src)[0];
const shape = (l: Layout): unknown => (l.kind === 'item' ? l.item.kind : { [l.kind]: l.children.map(shape) });
const items = (s: Slide) => sectionItems(s.sections[0]);
const htmls = (s: Slide) => items(s).map((i) => (i.kind === 'html' ? i.html : i.kind));

describe('slides, settings and notes', () => {
  it('a file holds many slides; the title is the first heading', () => {
    const ss = slides('slide { title "One" }\nslide { title "Two" }');
    expect(ss.map((s) => s.title)).toEqual(['One', 'Two']);
  });
  it('slide properties are its settings', () => {
    const s = one('slide background="a.jpg" transition=fade hidden=#true --accent="#f00" { title "T" }');
    expect(s.own).toMatchObject({ background: 'a.jpg', transition: 'fade', hidden: 'true', '--accent': '#f00' });
  });
  it('notes are the presenter notes', () => {
    expect(one('slide { text "x"; notes "say this" }').notes).toEqual(['say this']);
  });
  it('a slide with no content is still a slide', () => {
    const s = one('slide background="cover.jpg"');
    expect(s.sections).toHaveLength(1);
    expect(items(s)).toEqual([]);
  });
  it('the deck node and own layouts are read from the file', () => {
    const f = parseSlides('deck title="D" { vars --accent="#f00"; plugins "./a.js" }\nslide { title "x" }', 'http://x/s.slides');
    expect(f.deck).toMatchObject({ title: 'D', vars: { '--accent': '#f00' }, plugins: ['./a.js'] });
  });
});

describe('text nodes', () => {
  it('one item per node, with the kind', () => {
    const s = one('slide { title "T"; text "p"; list { - "a"; - "b" }; quote "q" by="who"; table { head "A" "B"; - "1" "2" } }');
    expect(items(s).map((i) => (i.kind === 'html' ? i.tag : i.kind))).toEqual(['h1', 'paragraph', 'list', 'blockquote', 'table']);
  });
  it('inline markup becomes HTML', () => {
    expect(htmls(one('slide { text "a **b** `x < y` [l](#top)" }'))).toEqual(['<p>a <strong>b</strong> <code>x &lt; y</code> <a href="#top">l</a></p>']);
  });
  it('lists: numbered, nested, with steps', () => {
    const s = one('slide { list numbered start=3 { - "a" { list { - "b" } } } }');
    expect(htmls(s)).toEqual(['<ol start="3"><li>a<ul><li>b</li></ul></li></ol>']);
    const t = one('slide { list steps { - "a"; - "b"; - "c" } }');
    expect(items(t).map((i) => i.at)).toEqual([1, 2, 3]);
    expect(t.sections[0].stages).toBe(4);
  });
  it('size makes a class; math is display KaTeX', () => {
    expect(htmls(one('slide { title "T" size="small" }'))[0]).toBe('<h1 class="size-small">T</h1>');
    expect(htmls(one('slide { math "x^2" }'))[0]).toContain('katex');
  });
  it('a text node needs its text', () => {
    expect(() => one('slide { text }')).toThrow(/needs a text/);
  });
  it('an unknown node is an error with its line', () => {
    expect(() => one('slide {\n  bogus "x"\n}')).toThrow(/line 2: unknown node `bogus`/);
  });
});

describe('reveal', () => {
  it('pause and step take the next click', () => {
    const s = one('slide { text "a"; pause; text "b"; text "c"; pause; text "d" }');
    expect(items(s).map((i) => i.at)).toEqual([0, 1, 1, 2]);
    const t = one('slide { text "a"; step anim=pop { text "b" }; text "c" }');
    expect(items(t).map((i) => [i.at, i.fx?.anim])).toEqual([[0, undefined], [1, 'pop'], [0, undefined]]);
  });
});

describe('layouts', () => {
  it('the layout follows from the content', () => {
    expect(one('slide { title "T"; text "x" }').own.layout).toBe('cover'); // the first slide
    const ss = slides('slide { title "A" }\nslide { title "Sec" }\nslide { title "T"; list { - "a" } }\nslide { title "T"; text "x"; image "a.png" }\nslide { image "a.png"; image "b.png" }\nslide { title "T"; code "ts" "let a = 1" }');
    expect(ss.map((s) => s.own.layout)).toEqual(['cover', 'section', 'default', 'image-right', 'gallery', 'code']);
  });
  it('two columns from slots', () => {
    const s = one('slide layout=two-cols columns="1 2" { title "T"; left { text "l" }; right { text "r" } }');
    expect(shape(s.sections[0].layout)).toEqual({ col: ['html', { row: [{ col: ['html'] }, { col: ['html'] }] }] });
    const kids = (s.sections[0].layout as { children: { children: { opts: Record<string, string> }[] }[] }).children[1].children;
    expect(kids.map((c) => c.opts.size)).toEqual(['1', '2']);
  });
  it('a node named like a slot picks the layout', () => {
    expect(one('slide { left { text "l" }; right { text "r" } }').own.layout).toBe('two-cols');
  });
  it('an unknown layout is an error', () => {
    expect(() => one('slide layout=nope { text "x" }')).toThrow(/unknown layout `nope`/);
  });
  it('an own layout fills its slots', () => {
    const f = parseSlides('layout "side" { row { col size="25%" { slot "s" }; col { slot } } }\nslide layout=side { s { text "a" }; text "b" }', 'http://x/s.slides');
    expect(shape(f.slides[0].sections[0].layout)).toEqual({ col: [{ row: [{ col: ['html'] }, { col: ['html'] }] }] });
  });
  it('explicit rows and columns, with size and alignment', () => {
    const s = one('slide { row gap=2 valign=middle { col size=2 { text "a" }; code "ts" "x" size=20 } }');
    expect(shape(s.sections[0].layout)).toEqual({ col: [{ row: [{ col: ['html'] }, { col: ['block'] }] }] });
    const box = (l: Layout) => l as { opts: Record<string, string>; children: Layout[] };
    const row = box(box(s.sections[0].layout).children[0]);
    expect(row.opts).toMatchObject({ gap: '2', valign: 'middle' });
    expect(box(row.children[0]).opts.size).toBe('2');
  });
});

describe('code', () => {
  it('the code of a swap are the states of one block; the first is shown from the start, the others take a click each', () => {
    const s = one('slide { swap { code "typescript" "let a = 1" id=a; code "typescript" "let a = 2" focus="1"; code "typescript" "let a = 3" } }');
    const b = s.sections[0].blocks[0];
    expect(b.id).toBe('a');
    expect(b.explicit).toBe(true);
    expect(b.frames.map((f) => [f.code, f.at, f.focus])).toEqual([['let a = 1', 0, undefined], ['let a = 2', 1, '1'], ['let a = 3', 2, undefined]]);
  });
  it('autoplay states take no clicks; loop is the swap\'s, lines the first code\'s', () => {
    const s = one('slide { swap autoplay=2 loop { code "typescript" "a" lines; code "typescript" "b" } }');
    const b = s.sections[0].blocks[0];
    expect(b.frames.map((f) => f.at)).toEqual([0, 0]);
    expect(b.opts).toMatchObject({ autoplay: '2', loop: 'true' });
    expect(b.classes).toEqual(['lines']);
  });
  it('a language without a grammar is a static block', () => {
    expect(items(one('slide { code "nolang" "x" }'))[0]).toMatchObject({ kind: 'code', lang: 'nolang' });
  });
  it('from= copies the last frame of an earlier block', () => {
    const ss = slides('slide { swap { code "typescript" "a" id=g; code "typescript" "b" } }\nslide { code from="g" }');
    resolveRefs(ss);
    expect(ss[1].sections[0].blocks[0].frames.map((f) => f.code)).toEqual(['b']);
    expect(() => resolveRefs(slides('slide { code from="nope" }'))).toThrow(/no earlier block/);
  });
});

describe('media, charts, diagrams', () => {
  it('media flags become options', () => {
    const i = items(one('slide { video "a.mp4" autoplay loop nocontrols }'))[0];
    expect(i).toMatchObject({ kind: 'video', src: 'http://x/d/a.mp4', attrs: { opts: { autoplay: 'true', loop: 'true', controls: 'false' } } });
  });
  it('a chart is drawn, a diagram kept as text', () => {
    const s = one('slide { chart "bar" """\n  x,a\n  p,1\n  """\n diagram "graph LR; A-->B" }');
    expect(htmls(s)[0]).toContain('<svg');
    expect(items(s)[1]).toMatchObject({ kind: 'diagram', text: 'graph LR; A-->B' });
  });
});

describe('swap', () => {
  const steps = (src: string) => one(src).sections[0].stages;
  it('shows one child at a time: each takes a click, the one before leaves', () => {
    const s = one('slide { title "T"; swap { text "a"; text "b"; text "c" } }');
    const its = items(s);
    expect(its.map((i) => [i.at, i.fx?.out])).toEqual([[0, undefined], [0, '1'], [1, '2'], [2, undefined]]);
    expect(steps('slide { swap { text "a"; text "b"; text "c" } }')).toBe(3);
    expect(shape(s.sections[0].layout)).toEqual({ col: ['html', { stack: ['html', 'html', 'html'] }] });
  });
  it('a child with several things is a col; a swap of code in it takes its own clicks', () => {
    const s = one('slide { swap { col { heading "a"; swap { code "ts" "1" id=x; code "ts" "2" } }; col { heading "b"; code "ts" "3" id=x } } }');
    expect(shape(s.sections[0].layout)).toEqual({ col: [{ stack: [{ col: ['html', 'block'] }, { col: ['html', 'block'] }] }] });
    const blocks = s.sections[0].blocks;
    expect(blocks.map((b) => b.frames.map((f) => f.at))).toEqual([[0, 1], [2]]);
    expect(items(s).filter((i) => i.fx?.out).map((i) => i.fx!.out)).toEqual(['2', '2']);
  });
  it('anim goes to what swaps in', () => {
    expect(items(one('slide { swap anim=left { text "a"; text "b" } }')).map((i) => i.fx?.anim)).toEqual(['left', 'left']);
  });
  it('stays in its place: what follows the swap is there from the start', () => {
    expect(items(one('slide { swap { text "a"; text "b" }; text "after" }')).map((i) => i.at)).toEqual([0, 1, 0]);
  });
});
