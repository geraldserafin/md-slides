// Markdown -> presentation model. One .md file = one slide. A slide is a list of sections (a new section starts at
// a level 1-2 heading); a section is text, images and animated code blocks in reading order, in one or two columns
// (a `---` line). A `+++` line makes everything after it appear on the next click (a reveal stage). Animated code
// blocks are independent unless they share a `#id`: blocks with the same id are the frames of one animation.
// HTML comments => presenter notes.
import { marked, type Token, type Tokens } from 'marked';
import { fileUrl } from './files';
import type { ChromeBar } from './chrome';
import { langFromTag, type Lang } from './parse';

export type Item = (
  | { kind: 'html'; html: string; tag: string } // heading/paragraph/list/quote...
  | { kind: 'image'; src: string; alt: string; attrs: Attrs }
  | { kind: 'video'; src: string; attrs: Attrs }
  | { kind: 'code'; text: string; lang: string } // static block (language without a grammar)
  | { kind: 'block'; block: number } // an animated code block: index into Section.blocks
) & { at: number }; // the reveal stage it appears at (0 = from the start)

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
  items: Item[]; // the (left) column
  /** the right column, when the markdown has a `---` line; undefined = a single column */
  right?: Item[];
  blocks: Block[];
  stages: number; // reveal stages: 1 + the number of clicks that add content
}

export interface Slide {
  /** slide front matter (layout, theme, background, class, halign, valign, --css-vars), merged over the deck defaults */
  meta: Record<string, string>;
  /** the slide's own front matter, before the deck defaults were merged in */
  own: Record<string, string>;
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
  textTransition?: 'fade' | 'slide' | 'slide-left' | 'zoom' | 'none'; // section text entrance
  textStagger?: number; // s, delay between consecutive text elements (default 0.06: heading first, then the body)
  textDrift?: number; // px, how far text drifts while it fades (new text rises into place, old text lifts away); 0 = none (default 8)
}

export interface DeckMeta {
  title?: string;
  description?: string;
  hidden?: boolean; // not listed in the gallery
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
function parseFence(info: string): { lang?: Lang; tag: string; id?: string; attrs: Attrs } {
  const words = info.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const plain = words.filter((w) => !w.startsWith('.') && !w.startsWith('#') && !w.includes('='));
  const lang = plain.map((w) => langFromTag(w)).find((l) => l !== undefined);
  const rest = words.filter((w) => w.startsWith('.') || w.includes('='));
  const id = words.find((w) => w.startsWith('#') && w.length > 1)?.slice(1);
  return { lang, tag: plain[0] ?? '', id, attrs: parseAttrs(rest.join(' ')) };
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

  // the section being built
  let cur: Section = { items: [], blocks: [], stages: 1 };
  let col: Item[] = cur.items; // the column items are added to
  let stage = 0;
  let bumped = false; // a `+++` since the last content: the next frame of a group needs no extra click
  let hasContent = false; // the section holds more than headings

  const startSection = () => {
    sections.push(cur);
    cur = { items: [], blocks: [], stages: 1 };
    col = cur.items;
    stage = 0;
    bumped = false;
    hasContent = false;
  };
  const closeSection = () => {
    cur.stages = stage + 1;
    if (cur.items.length || cur.right?.length || cur.blocks.length) startSection();
  };

  const add = (item: ItemInit, isHeading = false) => {
    col.push({ ...item, at: stage } as Item);
    bumped = false;
    if (!isHeading) hasContent = true;
  };

  for (const tok of tokens as Token[]) {
    if (tok.type === 'space') continue;
    if (tok.type === 'html' && tok.raw.trim().startsWith('<!--')) {
      notes.push(stripComment(tok.raw));
      continue;
    }
    if (tok.type === 'hr') {
      // a thematic break splits the section into a left and a right column (once)
      if (cur.right === undefined) {
        cur.right = [];
        col = cur.right;
      }
      continue;
    }
    if (tok.type === 'paragraph' && (tok as Tokens.Paragraph).text.trim() === '+++') {
      // everything after this line appears on the next click
      stage++;
      bumped = true;
      continue;
    }
    // (a heading that opens the right column belongs to it)
    if (tok.type === 'heading' && (tok as Tokens.Heading).depth <= 2 && hasContent && !(col === cur.right && col.length === 0)) {
      // a new level 1-2 heading after real content starts the next section
      closeSection();
    }
    if (tok.type === 'code') {
      const code = tok as Tokens.Code;
      const f = parseFence(code.lang ?? '');
      if (!f.lang) {
        // language without a grammar: a static block in the text
        add({ kind: 'code', text: code.text, lang: f.tag });
        continue;
      }
      const existing = f.id ? cur.blocks.find((b) => b.id === f.id) : undefined;
      if (existing) {
        // another frame of the same group: it takes a click of its own, unless a `+++` already made one
        if (!bumped) stage++;
        existing.frames.push({ code: code.text, focus: f.attrs.opts.focus, transition: f.attrs.opts.transition, at: stage });
        bumped = false;
      } else {
        cur.blocks.push({
          id: f.id ?? `b${autoId++}`, explicit: !!f.id, lang: f.lang, classes: f.attrs.classes, opts: f.attrs.opts,
          frames: [{ code: code.text, focus: f.attrs.opts.focus, transition: f.attrs.opts.transition, at: stage }],
        });
        add({ kind: 'block', block: cur.blocks.length - 1 });
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
    const isHeading = tok.type === 'heading';
    if (isHeading && !title) title = (tok as Tokens.Heading).text;
    const html = marked.parser([tok] as Token[]);
    add({ kind: 'html', html, tag: isHeading ? `h${(tok as Tokens.Heading).depth}` : tok.type }, isHeading);
  }
  closeSection();
  const slide: Slide = { meta, own: meta, sections, notes, title: meta.title || title || '(untitled)', url };
  applyLegacyLayout(slide);
  return slide;
}

/**
 * `layout: side` / `side-right` (the old way of getting two columns) put the code blocks of every section in the right
 * (side) or left (side-right) column and the rest in the other one. Sections written with `---` are left alone.
 */
export function applyLegacyLayout(slide: Slide) {
  const layout = slide.meta.layout;
  if (layout !== 'side' && layout !== 'side-right') return;
  for (const s of slide.sections) {
    if (!s.blocks.length || s.right !== undefined) continue;
    const isCode = (i: Item) => i.kind === 'block';
    const codes = s.items.filter(isCode);
    const rest = s.items.filter((i) => !isCode(i));
    if (layout === 'side') {
      s.items = rest;
      s.right = codes;
    } else {
      s.items = codes;
      s.right = rest;
    }
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
      return slide;
    }),
  );
  return { name, meta, slides };
}
