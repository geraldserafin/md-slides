// Markdown -> presentation model. One .md file = one slide; a slide splits into
// sections at code-block boundaries (text BEFORE a code block belongs to THAT section).
// Consecutive code blocks with the same classes = consecutive animation frames
// within one section. HTML comments => presenter notes.
import { marked, type Token, type Tokens } from 'marked';
import { fileUrl } from './files';
import type { ChromeBar } from './chrome';
import { langFromTag, type Lang } from './parse';

export type Item =
  | { kind: 'html'; html: string; tag: string } // heading/paragraph/list/quote...
  | { kind: 'image'; src: string; alt: string; attrs: Attrs }
  | { kind: 'video'; src: string; attrs: Attrs }
  | { kind: 'code'; text: string; lang: string }; // static block (language without a grammar)

export interface Attrs {
  classes: string[];
  opts: Record<string, string>;
}

export interface Section {
  items: Item[]; // the text of the (left) column
  /** the right column, when the markdown has a `---` line; undefined = a single column */
  right?: Item[];
  /** which column the animated code sits in: 0 = left (or the only column), 1 = right */
  codeCol: 0 | 1;
  classes: string[]; // fence classes (e.g. "left")
  opts: Record<string, string>; // fence key=value (e.g. size=18)
  lang?: Lang; // grammar of the animated code
  codes: string[]; // successive code states
  focus: (string | undefined)[]; // per frame: lines to keep bright, e.g. "2-4,7"
  transition: (string | undefined)[]; // per frame: how it is entered from the previous one: morph | fade | none
  hasFence: boolean;
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
  files: string[];
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
  for (const w of s.trim().split(/\s+/).filter(Boolean)) {
    if (w.startsWith('.')) attrs.classes.push(w.slice(1));
    else if (w.includes('=')) {
      const [k, ...v] = w.split('=');
      attrs.opts[k] = v.join('=').replace(/^["']|["']$/g, '');
    } else attrs.opts[w] = 'true';
  }
  return attrs;
}

/** fence info string: "cpp .left size=18" -> language (first recognized word) + attrs */
function parseFence(info: string): { lang?: Lang; tag: string; attrs: Attrs } {
  const words = info.trim().split(/\s+/).filter(Boolean);
  const plain = words.filter((w) => !w.startsWith('.') && !w.includes('='));
  const lang = plain.map((w) => langFromTag(w)).find((l) => l !== undefined);
  const rest = words.filter((w) => w.startsWith('.') || w.includes('='));
  return { lang, tag: plain[0] ?? '', attrs: parseAttrs(rest.join(' ')) };
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
  let pending: Item[] = []; // text of the left / only column, waiting for its section
  let pendingR: Item[] | undefined; // right column, after a `---`
  let inRight = false;
  let target: Section | undefined; // a section whose right column is being filled (code on the left, `---`, text on the right)
  let title = '';

  const add = (item: Item) => {
    if (target) target.right!.push(item);
    else if (inRight) pendingR!.push(item);
    else pending.push(item);
  };

  const reset = () => {
    pending = [];
    pendingR = undefined;
    inRight = false;
  };

  const newSection = (extra: Partial<Section>): Section => ({
    items: pending,
    right: pendingR,
    codeCol: inRight ? 1 : 0,
    classes: [],
    opts: {},
    codes: [],
    focus: [],
    transition: [],
    hasFence: false,
    ...extra,
  });

  for (const tok of tokens as Token[]) {
    if (tok.type === 'space') continue;
    if (tok.type === 'html' && tok.raw.trim().startsWith('<!--')) {
      notes.push(stripComment(tok.raw));
      continue;
    }
    if (tok.type === 'hr') {
      // a thematic break splits the slide into a left and a right column (once per section)
      if (inRight || target) continue;
      const last = sections[sections.length - 1];
      if (pending.length === 0 && last?.hasFence && last.right === undefined) {
        last.right = []; // code on the left: what follows is the right column of that section
        last.codeCol = 0;
        target = last;
      } else {
        inRight = true;
        pendingR = [];
      }
      continue;
    }
    if (tok.type === 'code') {
      const code = tok as Tokens.Code;
      const f = parseFence(code.lang ?? '');
      const last = sections[sections.length - 1];
      // same language/classes in a row, no text in between => next frame
      if (
        f.lang && last && last.lang === f.lang && pending.length === 0 && !inRight && !target &&
        last.classes.join(' ') === f.attrs.classes.join(' ')
      ) {
        last.codes.push(code.text);
        last.focus.push(f.attrs.opts.focus);
        last.transition.push(f.attrs.opts.transition);
        continue;
      }
      target = undefined;
      if (f.lang) {
        sections.push(newSection({ classes: f.attrs.classes, opts: f.attrs.opts, lang: f.lang, codes: [code.text], focus: [f.attrs.opts.focus], transition: [f.attrs.opts.transition], hasFence: true }));
        reset();
      } else {
        // language without a grammar: show as a static block in the column text
        add({ kind: 'code', text: code.text, lang: f.tag });
      }
      continue;
    }
    // a heading after the right column already has content starts something new
    if (tok.type === 'heading' && target && target.right!.length > 0 && (tok as Tokens.Heading).depth <= 3) target = undefined;
    if (tok.type === 'paragraph') {
      const m = SOLO_MEDIA.exec(tok.raw.trim());
      if (m) {
        const src = resolve(m[2], url);
        const attrs = parseAttrs(m[3]);
        add(VIDEO_EXT.test(src) ? { kind: 'video', src, attrs } : { kind: 'image', src, alt: m[1], attrs });
        continue;
      }
    }
    if (tok.type === 'heading' && !title) title = (tok as Tokens.Heading).text;
    const html = marked.parser([tok] as Token[]);
    add({ kind: 'html', html, tag: tok.type === 'heading' ? `h${(tok as Tokens.Heading).depth}` : tok.type });
  }
  if (pending.length || pendingR?.length) sections.push(newSection({ codeCol: 0 }));
  const slide: Slide = { meta, own: meta, sections, notes, title: meta.title || title || '(untitled)', url };
  applyLegacyLayout(slide);
  return slide;
}

/**
 * `layout: side` / `side-right` (the old way of getting two columns) turn every section with code into two columns:
 * text left, code right (side), or code left, text right (side-right). Columns written with `---` are left alone.
 */
export function applyLegacyLayout(slide: Slide) {
  const layout = slide.meta.layout;
  if (layout !== 'side' && layout !== 'side-right') return;
  for (const s of slide.sections) {
    if (!s.hasFence || s.right !== undefined) continue;
    if (layout === 'side') {
      s.right = [];
      s.codeCol = 1;
    } else {
      s.right = s.items;
      s.items = [];
      s.codeCol = 0;
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
