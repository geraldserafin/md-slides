import { describe, expect, it } from 'vitest';
import { barVisible, expand, isImage, usesSlideNumber } from '../src/chrome';
import { leaves, one, shape, slides } from './helpers';

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

describe('slides, settings and notes', () => {
  it('a file holds many slides; the title is the first heading', () => {
    expect(slides('slide { title "One" }\nslide { title "Two" }').map((s) => s.title)).toEqual(['One', 'Two']);
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
    expect(s.stages).toBe(1);
    expect(leaves(s)).toEqual([]);
  });
  it('the deck node and own layouts are read from the file', () => {
    const f = compileTextWithDeck();
    expect(f).toMatchObject({ title: 'D', vars: { '--accent': '#f00' }, plugins: ['./a.js'] });
  });
});

import { compileText } from './helpers';
const compileTextWithDeck = () => compileText('deck title="D" { vars --accent="#f00"; plugins "./a.js" }\nslide { title "x" }').program.meta;

describe('text nodes', () => {
  it('one element per node, with the kind', () => {
    const s = one('slide { title "T"; text "p"; list { - "a"; - "b" }; quote "q" by="who"; table { head "A" "B"; - "1" "2" } }');
    expect(leaves(s).map((e) => e.kind)).toEqual(['title', 'text', 'list', 'quote', 'table']);
  });
  it('the text keeps its markup for the renderer', () => {
    expect(leaves(one('slide { text "a **b** `x < y` [l](#top)" }'))[0].props.text).toBe('a **b** `x < y` [l](#top)');
  });
  it('lists: numbered, nested, with steps', () => {
    const l = leaves(one('slide { list numbered start=3 { - "a" { list { - "b" } } } }'))[0].props as { numbered: boolean; start: number; items: { text: string; children: { items: { text: string }[] }[] }[] };
    expect(l.numbered).toBe(true);
    expect(l.start).toBe(3);
    expect(l.items[0].children[0].items[0].text).toBe('b');
    const t = one('slide { list steps { - "a"; - "b"; - "c" } }');
    expect(leaves(t).map((e) => e.at)).toEqual([1, 2, 3]);
    expect(t.stages).toBe(4);
  });
  it('size and align are props of the element', () => {
    expect(leaves(one('slide { title "T" size="small" align=center }'))[0].props).toMatchObject({ size: 'small', align: 'center' });
  });
  it('a text node needs its text', () => {
    expect(() => one('slide { text }')).toThrow(/needs a text/);
  });
  it('an unknown node is an error with its file and line', () => {
    expect(() => one('slide {\n  bogus "x"\n}')).toThrow(/s\.slides, line 2: unknown node `bogus`/);
  });
});

describe('reveal', () => {
  it('pause and step take the next click', () => {
    expect(leaves(one('slide { text "a"; pause; text "b"; text "c"; pause; text "d" }')).map((e) => e.at)).toEqual([0, 1, 1, 2]);
    const t = one('slide { text "a"; step anim=pop { text "b" }; text "c" }');
    expect(leaves(t).map((e) => [e.at, e.effect])).toEqual([[0, undefined], [1, 'pop'], [0, undefined]]);
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
    expect(shape(s.root)).toEqual({ col: ['title', { row: [{ col: ['text'] }, { col: ['text'] }] }] });
    const row = s.root.children![1];
    expect(row.children!.map((c) => c.props.size)).toEqual(['1', '2']);
  });
  it('a node named like a slot picks the layout', () => {
    expect(one('slide { left { text "l" }; right { text "r" } }').own.layout).toBe('two-cols');
  });
  it('an unknown layout is an error', () => {
    expect(() => one('slide layout=nope { text "x" }')).toThrow(/unknown layout `nope`/);
  });
  it('an own layout fills its slots', () => {
    const s = one('layout "side" { row { col size="25%" { slot "s" }; col { slot } } }\nslide layout=side { s { text "a" }; text "b" }');
    expect(shape(s.root)).toEqual({ col: [{ row: [{ col: ['text'] }, { col: ['text'] }] }] });
  });
  it('explicit rows and columns, with size and alignment', () => {
    const s = one('slide { row gap=2 valign=middle { col size=2 { text "a" }; code "ts" "x" size=20 } }');
    expect(shape(s.root)).toEqual({ col: [{ row: [{ col: ['text'] }, 'code'] }] });
    const row = s.root.children![0];
    expect(row.props).toMatchObject({ gap: '2', valign: 'middle' });
    expect(row.children![0].props.size).toBe('2');
  });
  it('a grid is rows of columns', () => {
    const s = one('slide { grid columns=2 { text "a"; text "b"; text "c" } }');
    expect(shape(s.root)).toEqual({ col: [{ col: [{ row: ['text', 'text'] }, { row: ['text'] }] }] });
  });
});

describe('code', () => {
  it('a code node is one element; its key says what animation it belongs to', () => {
    const [a, b, c] = leaves(one('slide { code "ts" "1" id=x; code "ts" "2" id=x; code "ts" "3" }'));
    expect(a.key).toBe('code:@x');
    expect(b.key).toBe('code:@x');
    expect(c.key).toMatch(/^code:b/);
  });
  it('the code of a swap are the states of one block: one key, the first on at once, the others one click each', () => {
    const s = one('slide { swap { code "typescript" "let a = 1"; code "typescript" "let a = 2" focus="1"; code "typescript" "let a = 3" } }');
    const cs = leaves(s);
    expect(new Set(cs.map((e) => e.key)).size).toBe(1);
    expect(cs.map((e) => [e.at, e.out])).toEqual([[0, 1], [1, 2], [2, undefined]]);
    expect(cs[1].props.focus).toBe('1');
    expect(cs.map((e) => e.transition)).toEqual(['morph', 'morph', 'morph']);
  });
  it('a swap that plays by itself takes no clicks and says so', () => {
    const s = one('slide { swap autoplay=2 loop { code "typescript" "a"; code "typescript" "b" } }');
    expect(leaves(s).map((e) => e.at)).toEqual([0, 0]);
    expect(s.autoplay).toEqual([expect.objectContaining({ seconds: 2, loop: true, count: 2 })]);
    expect(s.stages).toBe(1);
  });
  it('flags and options go in the props', () => {
    const e = leaves(one('slide { code "typescript" "a" lines nopanel size=18 title="t" align=right }'))[0].props as { classes: string[]; opts: Record<string, string> };
    expect(e.classes).toEqual(['lines', 'nopanel']);
    expect(e.opts).toMatchObject({ size: '18', title: 't', halign: 'right' });
  });
  it('a language without a grammar is a static block', () => {
    expect(leaves(one('slide { code "nolang" "x" }'))[0].props).toMatchObject({ lang: 'nolang', animated: false });
  });
  it('from= copies the last state of an earlier block', () => {
    const ss = slides('slide { swap { code "typescript" "a" id=g; code "typescript" "b" id=g } }\nslide { code from="g" }');
    expect(leaves(ss[1])[0].props).toMatchObject({ text: 'b', lang: 'typescript', animated: true });
    expect(() => slides('slide { code from="nope" }')).toThrow(/no earlier block/);
  });
  it('a code needs a language and its code', () => {
    expect(() => one('slide { code }')).toThrow(/needs a language/);
    expect(() => one('slide { code "ts" }')).toThrow(/has no code/);
  });
});

describe('media, charts, diagrams', () => {
  it('media flags become props; a picture is keyed by its file', () => {
    const v = leaves(one('slide { video "a.mp4" autoplay loop nocontrols }'))[0];
    expect(v.props).toMatchObject({ src: 'http://x/d/a.mp4', autoplay: true, loop: true, controls: false });
    expect(leaves(one('slide { image "a.png" }'))[0].key).toBe('img:http://x/d/a.png');
  });
  it('a chart and a diagram keep their source', () => {
    const [c, d] = leaves(one('slide { chart "bar" """\n  x,a\n  p,1\n  """\n diagram "graph LR; A-->B" }'));
    expect(c.props).toMatchObject({ type: 'bar', csv: 'x,a\np,1' });
    expect(d.props.text).toBe('graph LR; A-->B');
  });
});

describe('swap', () => {
  it('shows one child at a time: each takes a click, the one before leaves', () => {
    const s = one('slide { title "T"; swap { text "a"; text "b"; text "c" } }');
    expect(leaves(s).map((e) => [e.at, e.out])).toEqual([[0, undefined], [0, 1], [1, 2], [2, undefined]]);
    expect(s.stages).toBe(3);
    expect(shape(s.root)).toEqual({ col: ['title', { stack: ['text', 'text', 'text'] }] });
    expect(leaves(s).slice(1).map((e) => e.phase)).toEqual([0, 1, 2]);
  });
  it('a child with several things is a col; what is inside swaps with it', () => {
    const s = one('slide { swap { col { heading "a"; text "x" }; col { heading "b" } } }');
    expect(shape(s.root)).toEqual({ col: [{ stack: [{ col: ['heading', 'text'] }, { col: ['heading'] }] }] });
    expect(leaves(s).map((e) => [e.at, e.out])).toEqual([[0, 1], [0, 1], [1, undefined]]);
  });
  it('transition and anim go to the children; the default is morph', () => {
    const s = one('slide { swap transition=fade anim=left { text "a"; text "b" } }');
    expect(leaves(s).map((e) => [e.transition, e.effect])).toEqual([['fade', 'left'], ['fade', 'left']]);
    expect(leaves(one('slide { swap { text "a"; text "b" } }'))[0].transition).toBe('morph');
  });
  it('stays in its place: what follows the swap is there from the start', () => {
    expect(leaves(one('slide { swap { text "a"; text "b" }; text "after" }')).map((e) => e.at)).toEqual([0, 1, 0]);
  });
  it('nested swaps end with the earliest end', () => {
    const s = one('slide { swap { swap { text "a"; text "b" }; text "c" } }');
    expect(leaves(s).map((e) => [e.at, e.out])).toEqual([[0, 1], [1, 2], [2, undefined]]);
  });
  it('autoplay of anything: all children are there from the start, a region plays them', () => {
    const s = one('slide { swap autoplay=1 { text "a"; text "b" } }');
    expect(leaves(s).map((e) => [e.at, e.out, e.phase])).toEqual([[0, undefined, 0], [0, undefined, 1]]);
    expect(s.autoplay[0].count).toBe(2);
  });
  it('needs two things', () => {
    expect(() => one('slide { swap { text "a" } }')).toThrow(/at least two/);
  });
});

describe('plugins written in the language', () => {
  const src = `plugin "ui" {
  node "callout" doc="A box" {
    arg "text" doc="what it says"
    prop "kind" values="info warn" default="info" doc="its color"
    body { col class="callout-{kind}" { text "{text}"; slot } }
  }
  effect "flip" pose="transform: rotateY(80deg)" doc="turned"
  theme "sunset" --bg="#2a1b2e"
}
slide { callout "Careful" kind=warn { text "inside" }; text "x" anim=flip }`;
  it('a node written in the language expands to its body', () => {
    const s = one(src);
    expect(shape(s.root)).toEqual({ col: [{ col: ['text', 'text'] }, 'text'] });
    const col = s.root.children![0];
    expect(col.props.class).toBe('callout-warn');
    expect((col.children![0].props as { text: string }).text).toBe('Careful');
  });
  it('registers its effects and themes', async () => {
    const { registry } = (await import('./helpers')).compileText(src);
    expect(registry.effect('flip')?.pose).toBe('transform: rotateY(80deg)');
    expect(registry.themes().sunset).toEqual({ '--bg': '#2a1b2e' });
  });
  it('the default of a prop is used when it is not written', () => {
    expect((one(src.replace('kind=warn ', '')).root.children![0].props as { class: string }).class).toBe('callout-info');
  });
});

describe('layouts and swaps', () => {
  it('a swap of only code is code to the layouts: text and a code swap sit side by side', () => {
    expect(one('slide { title "T"; text "x"; swap { code "ts" "a"; code "ts" "b" } }').own.layout).toBe('code-side');
    expect(one('slide { title "T"; swap { code "ts" "a"; code "ts" "b" } }').own.layout).toBe('code');
  });
  it('any other swap is the author\'s own layout', () => {
    expect(one('slide { title "T"; text "x"; swap { text "a"; text "b" } }').own.layout).toBe('default');
  });
});
