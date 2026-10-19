// Markdown -> presentation model. One .md file = one slide; a slide splits into
// sections at code-block boundaries (text BEFORE a code block belongs to THAT section).
// Consecutive code blocks with the same classes = consecutive animation frames
// within one section. HTML comments => presenter notes.
import { marked, type Token, type Tokens } from 'marked';
import { fileUrl } from './files';
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
  items: Item[];
  classes: string[]; // fence classes (e.g. "left")
  opts: Record<string, string>; // fence key=value (e.g. size=18)
  lang?: Lang; // grammar of the animated code
  codes: string[]; // successive code states
  hasFence: boolean;
}

export interface Slide {
  /** slide front matter (layout, theme, background, class, valign, --css-vars) */
  meta: Record<string, string>;
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
  textStagger?: number; // s, delay between consecutive text elements
}

export interface DeckMeta {
  title?: string;
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
  let pending: Item[] = [];
  let title = '';

  const newSection = (extra: Partial<Section>): Section => ({
    items: pending,
    classes: [],
    opts: {},
    codes: [],
    hasFence: false,
    ...extra,
  });

  const flushTextOnly = () => {
    if (pending.length) sections.push(newSection({}));
    pending = [];
  };

  for (const tok of tokens as Token[]) {
    if (tok.type === 'space') continue;
    if (tok.type === 'html' && tok.raw.trim().startsWith('<!--')) {
      notes.push(stripComment(tok.raw));
      continue;
    }
    if (tok.type === 'code') {
      const code = tok as Tokens.Code;
      const f = parseFence(code.lang ?? '');
      const last = sections[sections.length - 1];
      // same language/classes in a row, no text in between => next frame
      if (
        f.lang && last && last.lang === f.lang && pending.length === 0 &&
        last.classes.join(' ') === f.attrs.classes.join(' ')
      ) {
        last.codes.push(code.text);
        continue;
      }
      if (f.lang) {
        sections.push(newSection({ classes: f.attrs.classes, opts: f.attrs.opts, lang: f.lang, codes: [code.text], hasFence: true }));
        pending = [];
      } else {
        // language without a grammar: show as a static block in the section text
        pending.push({ kind: 'code', text: code.text, lang: f.tag });
      }
      continue;
    }
    if (tok.type === 'paragraph') {
      const m = SOLO_MEDIA.exec(tok.raw.trim());
      if (m) {
        const src = resolve(m[2], url);
        const attrs = parseAttrs(m[3]);
        pending.push(VIDEO_EXT.test(src) ? { kind: 'video', src, attrs } : { kind: 'image', src, alt: m[1], attrs });
        continue;
      }
    }
    if (tok.type === 'heading' && !title) title = (tok as Tokens.Heading).text;
    const html = marked.parser([tok] as Token[]);
    pending.push({ kind: 'html', html, tag: tok.type === 'heading' ? `h${(tok as Tokens.Heading).depth}` : tok.type });
  }
  flushTextOnly();
  return { meta, sections, notes, title: meta.title || title || '(untitled)', url };
}

export async function loadDeck(name: string, base = 'decks'): Promise<Deck> {
  const root = new URL(`${base}/${name}/`, document.baseURI).href;
  const meta = (await (await fetch(fileUrl(root + 'manifest.json'))).json()) as DeckMeta;
  const slides = await Promise.all(
    meta.files.map(async (f) => {
      const url = root + encodeURI(f);
      const text = await (await fetch(fileUrl(url))).text();
      return parseSlide(text, url);
    }),
  );
  return { name, meta, slides };
}
