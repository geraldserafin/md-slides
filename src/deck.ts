// .slide markup -> presentation model. One .slide file = one slide (see markup.ts for the syntax). A slide is a list of sections
// (`<section>`; without one, a single section; whatever sits outside the sections stays on screen while they swap); a section is
// a tree of `<row>`s (parts side by side) and `<col>`s (parts stacked) whose leaves are text (`<h1>`, `<p>`, `<ul>`...), animated
// code blocks, images, charts... in reading order. `<step>` makes what is inside appear on the next click. A `<code>` is one
// animated block, its `<frame>`s are the states it passes through; blocks with the same `id` are one animation across sections and slides.
import katex from 'katex';
import { renderChart } from './chart';
import { fileUrl } from './files';
import type { ChromeBar } from './chrome';
import { dedent, MarkupError, parseMarkup, rawText, tagAttrs, type El } from './markup';
import { langFromTag, type Lang } from './parse';

export type Item = (
  | { kind: 'html'; html: string; tag: string } // heading/paragraph/list/quote...
  | { kind: 'image'; src: string; alt: string; attrs: Attrs }
  | { kind: 'video'; src: string; attrs: Attrs }
  | { kind: 'audio'; src: string; attrs: Attrs }
  | { kind: 'diagram'; text: string; attrs: Attrs } // a ```mermaid fence
  | { kind: 'code'; text: string; lang: string } // static block (language without a grammar)
  | { kind: 'block'; block: number } // an animated code block: index into Section.blocks
) & {
  at: number; // the reveal stage it appears at (0 = from the start)
  /** per-element animation, from the attributes `anim=zoom delay=0.2 dur=0.6 out=3` */
  fx?: Record<string, string>;
};

/** an item before it is given its reveal stage */
type ItemInit = Item extends infer I ? (I extends unknown ? Omit<I, 'at'> : never) : never;

export interface Frame {
  code: string;
  focus?: string; // lines to keep bright, e.g. "2-4,7"
  transition?: string; // how it is entered from the previous frame: morph | fade | none
  at: number; // the reveal stage it appears at
}

/** An animated code block; blocks with the same id are the frames of one animation. */
export interface Block {
  id: string; // explicit (`id=name`, shared across the deck) or generated
  explicit: boolean;
  lang: Lang;
  classes: string[]; // `class=` of the code tag (e.g. "left", "lines", "panel")
  opts: Record<string, string>; // the other attributes (e.g. size=18, start=10, title=cart.ts, autoplay=1, loop)
  frames: Frame[];
  /** `<code from=id />`: a copy of the last frame of the block with that id (filled in when the deck is loaded) */
  from?: string;
}

export interface Attrs {
  classes: string[];
  opts: Record<string, string>;
}

/** the layout of a section: `row` = parts side by side, `col` = parts stacked; the leaves are the items */
export type Layout =
  | { kind: 'row' | 'col'; opts: Record<string, string>; children: Layout[] } // opts: size, halign, valign, justify, class
  | { kind: 'item'; item: Item };

export interface Section {
  layout: Layout; // a col
  blocks: Block[];
  stages: number; // reveal stages: 1 + the number of clicks that add content
}

const leavesOf = (l: Layout): Item[] => (l.kind === 'item' ? [l.item] : l.children.flatMap(leavesOf));
/** all items of a section, in reading order */
export const sectionItems = (s: Section): Item[] => leavesOf(s.layout);

export interface Slide {
  /** the slide's settings (the \`<slide>\` block: theme, background, class, halign, valign, --css-vars...), merged over the deck defaults */
  meta: Record<string, string>;
  /** the slide's own front matter, before the deck defaults were merged in */
  own: Record<string, string>;
  /** the \`<head>\`: stays while the sections below swap */
  head: Item[];
  sections: Section[];
  notes: string[];
  title: string;
  url: string;
}

export interface AnimationOpts {
  move?: number; // s, move duration
  fade?: number; // s, fade in/out duration
  moveDelay?: number; // s, stagger: moves start after the fade-out
  fadeInDelay?: number; // s, stagger: new tokens
  ease?: string; // CSS timing function
  slideFade?: number; // s, background/text change
  textTransition?: 'fade' | 'slide' | 'slide-right' | 'slide-left' | 'zoom' | 'none'; // section text entrance
  textStagger?: number; // s, delay between consecutive text elements (default 0.06: heading first, then the body)
  sectionTransition?: 'fade' | 'slide' | 'slide-right' | 'slide-left' | 'zoom' | 'none'; // swaps between the ## sections of a slide (default: the slide's own transition)
  textDrift?: number; // px, how far text drifts while it fades (new text rises into place, old text lifts away); 0 = none (default 8)
}

export interface DeckMeta {
  title?: string;
  description?: string;
  hidden?: boolean; // not listed in the gallery
  /** seconds per step: the deck plays itself (a key or click stops it; the `a` key starts it); `?autoplay=5` in the URL does the same */
  autoplay?: number;
  /** start again after the last step when autoplaying */
  loop?: boolean;
  thumbnail?: string; // gallery image instead of the live first slide
  author?: string;
  date?: string;
   /** settings applied to every slide unless the slide sets its own, e.g. {"align": "left"} */
  defaults?: Record<string, string>;
  /** like defaults, but only for slides that show two columns (a row of two parts); e.g. {"valign": "center"} */
  columns?: Record<string, string>;
  /** like defaults, but only for slides without code (a single column of text); e.g. {"halign": "center", "valign": "center"} */
  textOnly?: Record<string, string>;
  header?: ChromeBar;
  footer?: ChromeBar;
  theme?: string;
  /** themes for light and dark mode: the hub's toggle (and the OS) pick between them */
  schemes?: { light?: string; dark?: string };
  css?: string;
  /** deck-wide CSS variables, e.g. {"--accent": "#f00", "--font-text": "Georgia"} */
  vars?: Record<string, string>;
  /** custom themes: name -> CSS variables */
  themes?: Record<string, Record<string, string>>;
  fonts?: { family: string; src: string; weight?: string; style?: string }[];
  googleFonts?: string[];
  animation?: AnimationOpts;
  /** look of animated code blocks; a block's own options win */
  code?: CodeStyle;
  files: string[];
}

export interface CodeStyle {
  bg?: string; // "panel" | "none" | any CSS color
  lines?: boolean; // line numbers
  radius?: number | string; // panel corner radius (px or CSS length)
  pad?: string; // panel padding, CSS
}

export interface Deck {
  name: string;
  meta: DeckMeta;
  slides: Slide[];
}

const tex = (src: string, display: boolean) => katex.renderToString(src, { displayMode: display, throwOnError: false, output: 'html' });

/** `hidden: true` in the slide settings: the slide is left out of the presentation (and the PDF) but stays in the files */
export const isHidden = (s: Slide) => /^(true|yes|on|1)$/i.test(s.meta.hidden ?? '');

const resolve = (src: string, base: string) => {
  try {
    return fileUrl(new URL(src, base).href);
  } catch {
    return src;
  }
};

/** attributes that animate an element (any content tag takes them) */
const FX = ['anim', 'delay', 'dur', 'out', 'morph'];
/** attributes of the layout tags */
const LAYOUT = ['size', 'halign', 'valign', 'justify', 'class'];
/** attributes that are not options of an image or video */
const NOT_OPTS = new Set(['src', 'alt', 'class', 'at', 'id', ...FX]);

const without = (a: Record<string, string>, ...keys: string[]) => Object.fromEntries(Object.entries(a).filter(([k]) => !keys.includes(k)));
/** text tags -> the HTML they become (block level ones are items of their own) */
const NAMES: Record<string, string> = { b: 'strong', i: 'em', c: 'code', s: 'del', quote: 'blockquote' };
const BLOCK_TAGS: Record<string, string> = { h1: 'h1', h2: 'h2', h3: 'h3', p: 'paragraph', ul: 'list', ol: 'list', quote: 'blockquote', table: 'table' };
const INLINE_TAGS = new Set(['li', 'thead', 'tbody', 'tr', 'th', 'td', 'b', 'i', 'c', 's', 'a', 'kbd', 'mark', 'sub', 'sup', 'br', 'tex']);
/** attributes that go through to the HTML of a text tag */
const HTML_ATTRS = ['class', 'href', 'title', 'start', 'colspan', 'rowspan'];
const TEXT_ONLY = new Set(['steps', 'size', 'halign', 'valign']);
/** text of a tag as HTML text: `<` and a bare `&` are escaped, entities (`&lt;`, `&#39;`) stay */
const escText = (s: string) => s.replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escRaw = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const words = (s: string | undefined) => (s ?? '').split(/\s+/).filter(Boolean);

/** the `<slide>` block: `key: value` lines */
function parseSettings(text: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0 && !line.trimStart().startsWith('#')) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return meta;
}

/** the `<frame>`s of a code block (or the whole content as its only frame) */
function splitFrames(el: El): { attrs: Record<string, string>; code: string }[] {
  const raw = rawText(el);
  if (!/^\s*<frame[\s>]/.test(raw)) return [{ attrs: {}, code: dedent(raw) }];
  const out: { attrs: Record<string, string>; code: string }[] = [];
  let pos = 0;
  for (;;) {
    while (/\s/.test(raw[pos] ?? '')) pos++;
    if (pos >= raw.length) return out;
    const open = /^<frame\b([^>]*)>/.exec(raw.slice(pos));
    if (!open) throw new MarkupError('a <code> with <frame>s holds nothing but <frame>s', el.line);
    pos += open[0].length;
    let end = pos;
    for (;;) {
      end = raw.indexOf('</frame>', end);
      if (end < 0) throw new MarkupError('<frame> is never closed', el.line);
      if (raw[end - 1] !== '\\') break;
      end += 8;
    }
    out.push({ attrs: tagAttrs(open[1]), code: dedent(raw.slice(pos, end).replace(/\\<\//g, '</')) });
    pos = end + 8;
  }
}

export function parseSlide(src: string, url: string): Slide {
  const nodes = parseMarkup(src);
  const notes: string[] = [];
  const head: Item[] = [];
  const sections: Section[] = [];
  let meta: Record<string, string> = {};
  let title = '';

  /** the state of the section being built */
  interface State {
    stage: number; // the reveal stage of what is being added
    clicks: number; // the highest stage used so far (the next <step> is clicks + 1)
    blocks: Block[];
    fx: Record<string, string>; // animation attributes of the enclosing <step>
    inHead: boolean;
  }
  let autoId = 0;

  const fxOf = (attrs: Record<string, string>, id = true): Record<string, string> => {
    const fx: Record<string, string> = {};
    for (const k of FX) if (attrs[k] !== undefined) fx[k] = attrs[k];
    if (id && attrs.id !== undefined && fx.morph === undefined) fx.morph = attrs.id;
    return fx;
  };
  const leaf = (st: State, item: ItemInit, attrs: Record<string, string> = {}, id = true): Layout => {
    const own = fxOf(attrs, id);
    const fx = { ...st.fx, ...own };
    const at = /^\d+$/.test(attrs.at ?? '') ? parseInt(attrs.at, 10) : st.stage;
    st.clicks = Math.max(st.clicks, at, /^\d+$/.test(fx.out ?? '') ? parseInt(fx.out, 10) : 0);
    return { kind: 'item', item: { ...item, at, ...(Object.keys(fx).length ? { fx } : {}) } as Item };
  };
  const layoutOpts = (attrs: Record<string, string>) => Object.fromEntries(LAYOUT.filter((k) => attrs[k] !== undefined).map((k) => [k, attrs[k]]));
  const mediaAttrs = (attrs: Record<string, string>): Attrs => ({
    classes: words(attrs.class),
    opts: Object.fromEntries(Object.entries(attrs).filter(([k]) => !NOT_OPTS.has(k))),
  });

  /** the HTML of a text tag (and what is inside it) */
  const html = (n: El | string): string => {
    if (typeof n === 'string') return escText(n);
    if (n.tag === 'tex') return tex(dedent(rawText(n)), false);
    if (n.tag === 'c') return `<code>${escRaw(rawText(n))}</code>`;
    if (!INLINE_TAGS.has(n.tag) && !BLOCK_TAGS[n.tag]) throw new MarkupError(`<${n.tag}> is not allowed inside text`, n.line);
    const name = NAMES[n.tag] ?? n.tag;
    if (name === 'br') return '<br>';
    const attrs = HTML_ATTRS.filter((k) => n.attrs[k] !== undefined).map((k) => {
      const v = k === 'href' && !/^(#|[a-z]+:)/i.test(n.attrs[k]) ? resolve(n.attrs[k], url) : n.attrs[k];
      return ` ${k}="${v.replace(/"/g, '&quot;')}"`;
    }).join('');
    return `<${name}${attrs}>${n.children.map(html).join('')}</${name}>`;
  };
  const textOf = (n: El | string): string => (typeof n === 'string' ? n.trim() : n.tag === 'tex' || n.tag === 'c' ? rawText(n).trim() : n.children.map(textOf).join(' '));

  /** a block of text (<h1>..<h3>, <p>, <ul>, <ol>, <quote>, <table>, display <tex>): one leaf, or one per bullet with `steps` */
  const textLeaves = (el: El, st: State): Layout[] => {
    if (el.tag === 'tex') return [leaf(st, { kind: 'html', html: `<div class="math-block">${tex(dedent(rawText(el)), true)}</div>`, tag: 'math' }, el.attrs)];
    const attrs = Object.fromEntries(Object.entries(el.attrs).filter(([k]) => !TEXT_ONLY.has(k)));
    if (/^h[1-3]$/.test(el.tag) && !title) title = textOf(el);
    if ((el.tag === 'ul' || el.tag === 'ol') && el.attrs.steps !== undefined) {
      // bullet by bullet, one click each
      const base = st.stage;
      const lis = el.children.filter((c): c is El => typeof c !== 'string');
      const start = el.tag === 'ol' ? Number(el.attrs.start) || 1 : 1;
      return lis.map((li, i) => {
        const saved = st.stage;
        st.stage = base + 1 + i;
        const one: El = { ...el, attrs: { ...(el.tag === 'ol' ? { start: String(start + i) } : {}), ...(el.attrs.class ? { class: el.attrs.class } : {}) }, children: [li] };
        const l = leaf(st, { kind: 'html', html: html(one), tag: 'list' }, without(attrs, 'id', 'at', 'start', 'class'));
        st.stage = saved;
        return l;
      });
    }
    return [leaf(st, { kind: 'html', html: html(el), tag: BLOCK_TAGS[el.tag] }, attrs)];
  };

  const codeLeaf = (el: El, st: State): Layout => {
    const a = el.attrs;
    const frames = splitFrames(el);
    const lang = a.from === undefined && a.lang ? langFromTag(a.lang) : undefined;
    if (a.from === undefined && (!lang || st.inHead)) return leaf(st, { kind: 'code', text: frames[0].code, lang: a.lang ?? '' }, a, false);
    const opts = Object.fromEntries(Object.entries(a).filter(([k]) => !['lang', 'id', 'class', 'at', 'from', 'focus', 'transition', ...FX].includes(k)));
    const at = /^\d+$/.test(a.at ?? '') ? parseInt(a.at, 10) : st.stage;
    const block: Block = {
      id: a.id ?? `b${autoId++}`, explicit: a.id !== undefined, lang: lang ?? '', classes: words(a.class), opts,
      frames: a.from !== undefined ? [] : frames.map((f, i) => {
        // an autoplay block plays its frames by itself: they take no clicks
        const fat = i === 0 || a.autoplay !== undefined ? at : /^\d+$/.test(f.attrs.at ?? '') ? parseInt(f.attrs.at, 10) : ++st.clicks;
        st.clicks = Math.max(st.clicks, fat);
        return { code: f.code, focus: f.attrs.focus ?? a.focus, transition: f.attrs.transition ?? a.transition, at: fat };
      }),
    };
    if (a.from !== undefined) block.from = a.from;
    st.clicks = Math.max(st.clicks, at);
    st.blocks.push(block);
    return leaf(st, { kind: 'block', block: st.blocks.length - 1 }, without(a, 'id'), false);
  };

  /** the content of a container, as groups: every content tag (or run of loose text) is one group, i.e. one part of a row */
  const walk = (children: (El | string)[], st: State): Layout[][] => {
    const groups: Layout[][] = [];
    for (const n of children) {
      if (typeof n === 'string') {
        if (n.trim()) throw new MarkupError(`text outside a tag: ${JSON.stringify(n.trim().slice(0, 30))} (put it in a <p>)`, 0);
        continue;
      }
      const a = n.attrs;
      switch (n.tag) {
        case 'h1': case 'h2': case 'h3': case 'p': case 'ul': case 'ol': case 'quote': case 'table': case 'tex': {
          // size / halign / valign on a text tag belong to its part of the layout
          const g = textLeaves(n, st);
          groups.push(a.size || a.halign || a.valign ? [{ kind: 'col', opts: layoutOpts(a), children: g }] : g);
          break;
        }
        case 'code': groups.push([codeLeaf(n, st)]); break;
        case 'img': {
          const src = resolve(a.src ?? '', url);
          groups.push([leaf(st, { kind: 'image', src, alt: a.alt ?? '', attrs: mediaAttrs(a) }, a)]);
          break;
        }
        case 'video': groups.push([leaf(st, { kind: 'video', src: resolve(a.src ?? '', url), attrs: mediaAttrs(a) }, a)]); break;
        case 'audio': groups.push([leaf(st, { kind: 'audio', src: resolve(a.src ?? '', url), attrs: mediaAttrs(a) }, a)]); break;
        case 'chart': {
          const opts = Object.fromEntries(Object.entries(a).filter(([k]) => !NOT_OPTS.has(k)));
          groups.push([leaf(st, { kind: 'html', html: `<div class="chart-box" style="${a.width ? `width:${a.width}` : ''}">${renderChart(dedent(rawText(n)), opts)}</div>`, tag: 'chart' }, a)]);
          break;
        }
        case 'diagram': groups.push([leaf(st, { kind: 'diagram', text: dedent(rawText(n)), attrs: mediaAttrs(a) }, a)]); break;
        case 'row':
        case 'col': {
          const inner = walk(n.children, st);
          const kids = n.tag === 'row' ? inner.map(part) : inner.flat();
          groups.push([{ kind: n.tag, opts: layoutOpts(a), children: kids }]);
          break;
        }
        case 'step': {
          const base = st.stage;
          const baseFx = st.fx;
          const at = /^\d+$/.test(a.at ?? '') ? parseInt(a.at, 10) : st.clicks + 1;
          st.clicks = Math.max(st.clicks, at);
          st.stage = at;
          st.fx = { ...st.fx, ...fxOf(a, false) };
          groups.push(...walk(n.children, st));
          st.stage = base;
          st.fx = baseFx;
          break;
        }
        case 'notes': notes.push(dedent(rawText(n))); break;
        default: throw new MarkupError(`<${n.tag}> is not a tag of the slide markup here`, n.line);
      }
    }
    return groups;
  };
  /** several things in one part of a row = a col */
  const part = (g: Layout[]): Layout => (g.length === 1 ? g[0] : { kind: 'col', opts: {}, children: g });

  const section = (children: (El | string)[]): Section => {
    const st: State = { stage: 0, clicks: 0, blocks: [], fx: {}, inHead: false };
    const layout: Layout = { kind: 'col', opts: {}, children: walk(children, st).flat() };
    return { layout, blocks: st.blocks, stages: st.clicks + 1 };
  };

  const loose: (El | string)[] = [];
  const parts: El[] = [];
  for (const n of nodes) {
    if (typeof n !== 'string' && n.tag === 'slide') meta = { ...meta, ...parseSettings(rawText(n)) };
    else if (typeof n !== 'string' && n.tag === 'section') parts.push(n);
    else loose.push(n);
  }
  if (parts.length) {
    // what sits outside the sections stays on screen while they swap
    const st: State = { stage: 0, clicks: 0, blocks: [], fx: {}, inHead: true };
    for (const l of walk(loose, st).flat()) head.push(...leavesOf(l).map((i) => ({ ...i, at: 0 })));
    for (const p of parts) sections.push(section(p.children));
  } else {
    const s = section(loose);
    if (sectionItems(s).length) sections.push(s);
  }
  return { meta, own: meta, head, sections, notes, title: meta.title || title || '(untitled)', url };
}

/** `<code from=id />`: fill in the copies (the last frame of the nearest earlier block with that id) */
export function resolveRefs(slides: Slide[]) {
  const seen = new Map<string, Block>();
  for (const slide of slides)
    for (const sec of slide.sections)
      for (const b of sec.blocks) {
        if (b.from !== undefined) {
          const src = seen.get(b.from);
          if (!src) throw new Error(`<code from=${b.from}>: no earlier block with that id (${slide.url})`);
          b.lang = src.lang;
          b.frames = [{ code: src.frames[src.frames.length - 1].code, at: b.frames[0]?.at ?? 0 }];
        } else if (b.explicit) seen.set(b.id, b);
      }
}

export async function loadDeck(name: string, base = 'decks'): Promise<Deck> {
  const root = new URL(`${base}/${name}/`, document.baseURI).href;
  const meta = (await (await fetch(fileUrl(root + 'manifest.json'))).json()) as DeckMeta;
  const slides = await Promise.all(
    meta.files.map(async (f) => {
      const url = root + encodeURI(f);
      const text = await (await fetch(fileUrl(url))).text();
      let slide: Slide;
      try {
        slide = parseSlide(text, url);
      } catch (e) {
        throw new Error(`${name}/${f}, ${(e as Error).message}`);
      }
      slide.meta = { ...(meta.defaults ?? {}), ...slide.own };
      return slide;
    }),
  );
  resolveRefs(slides);
  return { name, meta, slides };
}
