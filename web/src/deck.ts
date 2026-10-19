// Markdown -> model prezentacji. Jeden plik .md = jeden slajd; slajd dzieli się
// na sekcje na granicach code-bloków (tekst PRZED kodem należy do TEJ sekcji).
// Kolejne code-bloki o tych samych klasach pod rząd = kolejne klatki animacji
// w obrębie jednej sekcji. Komentarze HTML => notatki prezentera.
import { marked, type Token, type Tokens } from 'marked';
import { langFromTag, type Lang } from './parse';

export type Item =
  | { kind: 'html'; html: string; tag: string } // heading/paragraf/lista/cytat...
  | { kind: 'image'; src: string; alt: string; attrs: Attrs }
  | { kind: 'video'; src: string; attrs: Attrs }
  | { kind: 'code'; text: string; lang: string }; // statyczny blok (język bez gramatyki)

export interface Attrs {
  classes: string[];
  opts: Record<string, string>;
}

export interface Section {
  items: Item[];
  classes: string[]; // klasy z fence'a (np. "left")
  opts: Record<string, string>; // key=value z fence'a (np. size=18)
  lang?: Lang; // gramatyka animowanego kodu
  codes: string[]; // kolejne stany kodu
  hasFence: boolean;
}

export interface Slide {
  sections: Section[];
  notes: string[];
  title: string;
  url: string;
}

export interface DeckMeta {
  title?: string;
  theme?: string;
  css?: string;
  files: string[];
}

export interface Deck {
  name: string;
  meta: DeckMeta;
  slides: Slide[];
}

const VIDEO_EXT = /\.(mp4|webm|ogv|mov|m4v)(\?.*)?$/i;

/** "{.left width=60% muted}" -> klasy + opcje */
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

/** info string fence'a: "cpp .left size=18" -> język (pierwsze rozpoznane słowo) + attrs */
function parseFence(info: string): { lang?: Lang; tag: string; attrs: Attrs } {
  const words = info.trim().split(/\s+/).filter(Boolean);
  const plain = words.filter((w) => !w.startsWith('.') && !w.includes('='));
  const lang = plain.map((w) => langFromTag(w)).find((l) => l !== undefined);
  const rest = words.filter((w) => w.startsWith('.') || w.includes('='));
  return { lang, tag: plain[0] ?? '', attrs: parseAttrs(rest.join(' ')) };
}

const resolve = (src: string, base: string) => {
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
};

function stripComment(raw: string): string {
  return raw.trim().replace(/^<!--/, '').replace(/-->$/, '').trim();
}

/** Akapit złożony z JEDNEGO obrazka/wideo: ![alt](src){.class opt=val} */
const SOLO_MEDIA = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)(?:\{([^}]*)\})?$/;

export function parseSlide(markdown: string, url: string): Slide {
  const tokens = marked.lexer(markdown);
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
      // ten sam język/klasy pod rząd, bez tekstu pomiędzy => kolejna klatka
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
        // język bez gramatyki: pokaż jako statyczny blok w tekście sekcji
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
  return { sections, notes, title: title || '(bez tytułu)', url };
}

export async function loadDeck(name: string, base = 'decks'): Promise<Deck> {
  const root = new URL(`${base}/${name}/`, document.baseURI).href;
  const meta = (await (await fetch(root + 'manifest.json')).json()) as DeckMeta;
  const slides = await Promise.all(
    meta.files.map(async (f) => {
      const url = root + encodeURI(f);
      const text = await (await fetch(url)).text();
      return parseSlide(text, url);
    }),
  );
  return { name, meta, slides };
}
