// Markdown -> presentation model. One .md file = one slide. A slide is a list of sections (a new section starts at
// a level 1-2 heading); a section is a grid: rows split by `---` lines, cells split by `|||` lines, and in every cell text,
// images and animated code blocks in reading order. A `+++` line makes everything after it appear on the next click
// (a reveal stage; `+++ 3` = on click 3). Animated code
// blocks are independent unless they share a `#id`: blocks with the same id are the frames of one animation.
// HTML comments => presenter notes.
import { marked, type Token, type Tokens } from 'marked';
import katex from 'katex';
import { renderChart } from './chart';
import { fileUrl } from './files';
import type { ChromeBar } from './chrome';
import { langFromTag, type Lang } from './parse';

export type Item = (
  | { kind: 'html'; html: string; tag: string } // heading/paragraph/list/quote...
  | { kind: 'image'; src: string; alt: string; attrs: Attrs }
  | { kind: 'video'; src: string; attrs: Attrs }
  | { kind: 'diagram'; text: string; attrs: Attrs } // a ```mermaid fence
  | { kind: 'code'; text: string; lang: string } // static block (language without a grammar)
  | { kind: 'block'; block: number } // an animated code block: index into Section.blocks
) & {
  at: number; // the reveal stage it appears at (0 = from the start)
  /** per-element animation, from a `{anim=zoom delay=0.2 dur=0.6 out=3}` line after it */
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
  id: string; // explicit (`#name`, shared across the deck) or generated
  explicit: boolean;
  lang: Lang;
  classes: string[]; // fence classes (e.g. "left", "lines", "panel")
  opts: Record<string, string>; // fence key=value (e.g. size=18, start=10, title=cart.ts)
  frames: Frame[];
}

export interface Attrs {
  classes: string[];
  opts: Record<string, string>;
}

export interface Section {
  /** the grid: rows (split by `---`) of cells (split by `|||`) of items; a plain section is one row with one cell */
  rows: Item[][][];
  /** options of the cells (after a `||| span=2 valign=center`), parallel to rows: cellOpts[row][cell] */
  cellOpts: Record<string, string>[][];
  blocks: Block[];
  stages: number; // reveal stages: 1 + the number of clicks that add content
}

/** all items of a section, in reading order */
export const sectionItems = (s: Section): Item[] => s.rows.flat(2);

export interface Slide {
  /** slide front matter (layout, theme, background, class, halign, valign, --css-vars), merged over the deck defaults */
  meta: Record<string, string>;
  /** the slide's own front matter, before the deck defaults were merged in */
  own: Record<string, string>;
  /** a level 1 heading (and what follows it) before the first level 2 heading: stays while the sections below swap */
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
  /** front matter applied to every slide unless the slide sets its own, e.g. {"align": "left"} */
  defaults?: Record<string, string>;
  /** like defaults, but only for slides that show two columns (text next to code); e.g. {"valign": "center"} */
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

// math: `$x^2$` inline, `$$ ... $$` as a block (KaTeX). A dollar sign next to a space or a digit stays a dollar sign ("$5 and $6").
const tex = (src: string, display: boolean) => katex.renderToString(src, { displayMode: display, throwOnError: false, output: 'html' });
marked.use({
  extensions: [
    {
      name: 'blockMath', level: 'block',
      start: (s: string) => s.indexOf('$$'),
      tokenizer(s: string) {
        const m = /^\$\$[ \t]*\n?([\s\S]+?)\n?[ \t]*\$\$[ \t]*(?:\n|$)/.exec(s);
        return m ? { type: 'blockMath', raw: m[0], text: m[1].trim() } : undefined;
      },
      renderer: (t) => `<div class="math-block">${tex(String((t as unknown as { text: string }).text), true)}</div>\n`,
    },
    {
      name: 'inlineMath', level: 'inline',
      start: (s: string) => s.indexOf('$'),
      tokenizer(s: string) {
        const m = /^\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<![\s\\])\$(?!\d)/.exec(s);
        return m ? { type: 'inlineMath', raw: m[0], text: m[1] } : undefined;
      },
      renderer: (t) => tex(String((t as unknown as { text: string }).text), false),
    },
  ],
});

/** front matter `hidden: true`: the slide is left out of the presentation (and the PDF) but stays in the files */
export const isHidden = (s: Slide) => /^(true|yes|on|1)$/i.test(s.meta.hidden ?? '');

const VIDEO_EXT = /\.(mp4|webm|ogv|mov|m4v)(\?.*)?$/i;

/** "{.left width=60% muted}" -> classes + options */
export function parseAttrs(s: string | undefined): Attrs {
  const attrs: Attrs = { classes: [], opts: {} };
  if (!s) return attrs;
  for (const w of s.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []) {
    if (w.startsWith('.')) attrs.classes.push(w.slice(1));
    else if (w.includes('=')) {
      const [k, ...v] = w.split('=');
      attrs.opts[k] = v.join('=').replace(/^["']|["']$/g, '');
    } else attrs.opts[w] = 'true';
  }
  return attrs;
}

/** fence info string: "cpp #fn .lines start=10 title=\"a b.ts\"" -> language, group id, classes and options */
function parseFence(info: string): { lang?: Lang; tag: string; id?: string; at?: number; attrs: Attrs } {
  const words = info.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const plain = words.filter((w) => !w.startsWith('.') && !w.startsWith('#') && !w.startsWith('@') && !w.includes('='));
  const lang = plain.map((w) => langFromTag(w)).find((l) => l !== undefined);
  const rest = words.filter((w) => w.startsWith('.') || w.includes('='));
  const id = words.find((w) => w.startsWith('#') && w.length > 1)?.slice(1);
  const atWord = words.find((w) => /^@\d+$/.test(w));
  return { lang, tag: plain[0] ?? '', id, at: atWord ? parseInt(atWord.slice(1), 10) : undefined, attrs: parseAttrs(rest.join(' ')) };
}

const resolve = (src: string, base: string) => {
  try {
    return fileUrl(new URL(src, base).href);
  } catch {
    return src;
  }
};

function stripComment(raw: string): string {
  return raw.trim().replace(/^<!--/, '').replace(/-->$/, '').trim();
}

/** A paragraph made of ONE image/video: ![alt](src){.class opt=val} */
const SOLO_MEDIA = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)(?:\{([^}]*)\})?$/;

/** Front matter: a `---` block at the very start of the file, `key: value` lines. */
export function splitFrontMatter(md: string): { meta: Record<string, string>; body: string } {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(md);
  if (!m) return { meta: {}, body: md };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0 && !line.trimStart().startsWith("#")) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: md.slice(m[0].length) };
}

export function parseSlide(markdown: string, url: string): Slide {
  const { meta, body } = splitFrontMatter(markdown);
  const tokens = marked.lexer(body);
  marked.walkTokens(tokens, (t) => {
    if (t.type === 'image') (t as Tokens.Image).href = resolve((t as Tokens.Image).href, url);
    if (t.type === 'link') {
      const l = t as Tokens.Link;
      if (!/^(#|[a-z]+:)/i.test(l.href)) l.href = resolve(l.href, url);
    }
  });

  const notes: string[] = [];
  const sections: Section[] = [];
  let title = '';
  let autoId = 0;

  // the section being built: a grid of rows (`---`) of cells (`|||`)
  // a level 1 heading at the start, with level 2 headings after it: the h1 part is the slide's head, shown above every section
  const real = (tokens as Token[]).filter((t) => t.type !== 'space' && !(t.type === 'html' && t.raw.trim().startsWith('<!--')));
  const hasHead = real[0]?.type === 'heading' && (real[0] as Tokens.Heading).depth === 1 &&
    real.some((t) => t.type === 'heading' && (t as Tokens.Heading).depth === 2);
  let inHead = hasHead;
  const head: Item[] = [];
  let cur: Section = { rows: [[[]]], cellOpts: [[{}]], blocks: [], stages: 1 };
  let row = 0;
  let cell = 0;
  let stage = 0;
  let bumped = false; // a `+++` since the last content: the next frame of a group needs no extra click
  let hasContent = false; // the section holds more than headings
  let maxStage = 0;

  const col = () => cur.rows[row][cell];
  const startSection = () => {
    sections.push(cur);
    cur = { rows: [[[]]], cellOpts: [[{}]], blocks: [], stages: 1 };
    row = 0;
    cell = 0;
    stage = 0;
    maxStage = 0;
    bumped = false;
    hasContent = false;
  };
  const closeSection = () => {
    cur.stages = Math.max(stage, maxStage) + 1;
    if (sectionItems(cur).length || cur.blocks.length) startSection();
  };

  const add = (item: ItemInit, isHeading = false) => {
    if (inHead) {
      head.push({ ...item, at: 0 } as Item);
      return;
    }
    col().push({ ...item, at: stage } as Item);
    maxStage = Math.max(maxStage, stage);
    bumped = false;
    if (!isHeading) hasContent = true;
  };

  /** split the list that was just added into one item per bullet, each on a click of its own */
  const stepList = () => {
    const items = col();
    const last = items[items.length - 1];
    const list = lastList;
    if (!list || !last || last.kind !== 'html' || last.tag !== 'list') return;
    items.pop();
    const base = stage;
    list.items.forEach((li, i) => {
      const one = { ...list, items: [li], start: list.ordered ? (Number(list.start) || 1) + i : list.start } as Tokens.List;
      col().push({ kind: 'html', html: marked.parser([one] as Token[]), tag: 'list', at: base + 1 + i });
    });
    stage = base + list.items.length;
    maxStage = Math.max(maxStage, stage);
    bumped = true;
  };
  let lastList: Tokens.List | undefined;

  for (const tok of tokens as Token[]) {
    if (tok.type === 'space') continue;
    if (tok.type === 'html' && tok.raw.trim().startsWith('<!--')) {
      notes.push(stripComment(tok.raw));
      continue;
    }
    if (tok.type === 'hr') {
      // `---`: the next row (nothing yet in the very first cell means a leading `---`: ignore it)
      if (sectionItems(cur).length || row > 0 || cell > 0) {
        cur.rows.push([[]]);
        cur.cellOpts.push([{}]);
        row++;
        cell = 0;
      }
      continue;
    }
    if (tok.type === 'paragraph') {
      const text = (tok as Tokens.Paragraph).text.trim();
      const bars = /^\|\|\|(?:\s+(.+))?$/.exec(text);
      if (bars) {
        // `|||`: the next cell of this row; `||| span=2 valign=center` gives it options. At the start of a cell it only
        // sets the options of that (still empty) cell.
        const opts = parseAttrs(bars[1]).opts;
        if (col().length === 0 && !(row === 0 && cell === 0 && !bars[1])) {
          Object.assign(cur.cellOpts[row][cell], opts);
        } else {
          cur.rows[row].push([]);
          cur.cellOpts[row].push(opts);
          cell++;
        }
        continue;
      }
      const fx = /^\{([^}]*=[^}]*)\}$/.exec(text);
      if (fx) {
        // `{anim=zoom delay=0.2 dur=0.6 at=2 out=4}` right after an item (blank line between): how it comes in, when, and when it goes
        const last = col()[col().length - 1];
        if (last) {
          const o = parseAttrs(fx[1]).opts;
          last.fx = { ...last.fx, ...o };
          if (o.at !== undefined && /^\d+$/.test(o.at)) last.at = parseInt(o.at, 10);
          if (o.out !== undefined && /^\d+$/.test(o.out)) maxStage = Math.max(maxStage, parseInt(o.out, 10));
          maxStage = Math.max(maxStage, last.at);
          continue;
        }
      }
      if (text === '{.steps}') {
        // the list right before it appears bullet by bullet, one click each
        stepList();
        continue;
      }
      const plus = /^\+\+\+(?:\s+(\d+))?$/.exec(text);
      if (plus) {
        // `+++`: everything after this appears on the next click; `+++ 3`: on click 3
        stage = plus[1] !== undefined ? parseInt(plus[1], 10) : stage + 1;
        maxStage = Math.max(maxStage, stage);
        bumped = true;
        continue;
      }
    }
    if (inHead && tok.type === 'heading' && (tok as Tokens.Heading).depth === 2) inHead = false;
    // a new level 1-2 heading after real content starts the next section (one that opens a later cell belongs to it)
    if (tok.type === 'heading' && (tok as Tokens.Heading).depth <= 2 && hasContent && !((row > 0 || cell > 0) && col().length === 0)) {
      closeSection();
    }
    if (tok.type === 'code') {
      const code = tok as Tokens.Code;
      const f = parseFence(code.lang ?? '');
      if (f.tag.toLowerCase() === 'chart') {
        add({ kind: 'html', html: `<div class="chart-box" style="${f.attrs.opts.width ? `width:${f.attrs.opts.width}` : ''}">${renderChart(code.text, f.attrs.opts)}</div>`, tag: 'chart' });
        continue;
      }
      if (f.tag.toLowerCase() === 'mermaid') {
        add({ kind: 'diagram', text: code.text, attrs: f.attrs });
        continue;
      }
      if (!f.lang || inHead) {
        // language without a grammar: a static block in the text
        add({ kind: 'code', text: code.text, lang: f.tag });
        continue;
      }
      const existing = f.id ? cur.blocks.find((b) => b.id === f.id) : undefined;
      if (existing) {
        // another frame of the same group: it takes a click of its own, unless a `+++` already made one or @N says which
        if (f.at === undefined && !bumped) stage++;
        const at = f.at ?? stage;
        existing.frames.push({ code: code.text, focus: f.attrs.opts.focus, transition: f.attrs.opts.transition, at });
        maxStage = Math.max(maxStage, at);
        bumped = false;
      } else {
        const at = f.at ?? stage;
        cur.blocks.push({
          id: f.id ?? `b${autoId++}`, explicit: !!f.id, lang: f.lang, classes: f.attrs.classes, opts: f.attrs.opts,
          frames: [{ code: code.text, focus: f.attrs.opts.focus, transition: f.attrs.opts.transition, at }],
        });
        col().push({ kind: 'block', block: cur.blocks.length - 1, at });
        maxStage = Math.max(maxStage, at);
        bumped = false;
        hasContent = true;
      }
      continue;
    }
    if (tok.type === 'paragraph') {
      const m = SOLO_MEDIA.exec(tok.raw.trim());
      if (m) {
        const src = resolve(m[2], url);
        const attrs = parseAttrs(m[3]);
        add(VIDEO_EXT.test(src) ? { kind: 'video', src, attrs } : { kind: 'image', src, alt: m[1], attrs });
        continue;
      }
    }
    lastList = tok.type === 'list' ? (tok as Tokens.List) : undefined;
    const isHeading = tok.type === 'heading';
    if (isHeading && !title) title = (tok as Tokens.Heading).text;
    const html = marked.parser([tok] as Token[]);
    add({ kind: 'html', html, tag: isHeading ? `h${(tok as Tokens.Heading).depth}` : tok.type }, isHeading);
  }
  closeSection();
  const slide: Slide = { meta, own: meta, head, sections, notes, title: meta.title || title || '(untitled)', url };
  applyLegacyLayout(slide);
  applyGrid(slide);
  return slide;
}

/**
 * `layout: side` / `side-right` (the old way of getting two columns) put the code blocks of every section in the right
 * (side) or left (side-right) cell and the rest in the other one. Sections that already have a grid are left alone.
 */
/**
 * `grid: 3` (or `3x2`) in the front matter: cells that overflow N per row wrap into the next row, so a grid is just N
 * and a list of `|||` cells (rows written with `---` are kept; only rows longer than N are cut).
 */
export function applyGrid(slide: Slide) {
  const n = parseInt(slide.meta.grid ?? '', 10);
  if (!(n >= 1)) return;
  for (const s of slide.sections) {
    const rows: Item[][][] = [];
    const opts: Record<string, string>[][] = [];
    s.rows.forEach((cells, r) => {
      for (let i = 0; i < cells.length; i += n) {
        rows.push(cells.slice(i, i + n));
        opts.push(s.cellOpts[r].slice(i, i + n));
      }
    });
    s.rows = rows;
    s.cellOpts = opts;
  }
}

export function applyLegacyLayout(slide: Slide) {
  const layout = slide.meta.layout;
  if (layout !== 'side' && layout !== 'side-right') return;
  for (const s of slide.sections) {
    if (!s.blocks.length || s.rows.length !== 1 || s.rows[0].length !== 1) continue; // already a grid of its own
    const items = s.rows[0][0];
    const code = items.filter((i) => i.kind === 'block');
    const rest = items.filter((i) => i.kind !== 'block');
    s.rows = [layout === 'side' ? [rest, code] : [code, rest]];
    s.cellOpts = [[{}, {}]];
  }
}

export async function loadDeck(name: string, base = 'decks'): Promise<Deck> {
  const root = new URL(`${base}/${name}/`, document.baseURI).href;
  const meta = (await (await fetch(fileUrl(root + 'manifest.json'))).json()) as DeckMeta;
  const slides = await Promise.all(
    meta.files.map(async (f) => {
      const url = root + encodeURI(f);
      const text = await (await fetch(fileUrl(url))).text();
      const slide = parseSlide(text, url);
      slide.meta = { ...(meta.defaults ?? {}), ...slide.own };
      applyLegacyLayout(slide);
      applyGrid(slide);
      return slide;
    }),
  );
  return { name, meta, slides };
}
