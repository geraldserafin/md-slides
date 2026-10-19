// Deck gallery (the page shown when several decks are served): a card per deck with a live
// thumbnail of its first slide, the title below it and a quiet line: author · date · slides.
import { loadDeck, type Deck } from './deck';
import { fileUrl } from './files';
import { Player } from './player';
import { buildSteps } from './steps';
import { initialTheme, loadDeckCss, registerDeckStyle, toggleColorScheme } from './themes';

/** hub.json (next to the deck folders): customizes the chooser page */
export interface HubMeta {
  title?: string;
  subtitle?: string;
  /** an image, relative to the hub folder */
  logo?: string;
  /** a line of small text at the bottom of the page */
  footer?: string;
  /** start theme: dark, light, paper or one of `themes` (a visitor's own choice wins) */
  theme?: string;
  themes?: Record<string, Record<string, string>>;
  fonts?: { family: string; src: string; weight?: string; style?: string }[];
  googleFonts?: string[];
  /** extra stylesheet, relative to the hub folder */
  css?: string;
  /** header and footer alignment (default start) */
  align?: 'start' | 'center';
  /** minimum card width in px (default 340) */
  cardWidth?: number;
  /** what the line under a title shows (default all three) */
  show?: ('author' | 'date' | 'slides')[];
  /** deck names, first to last; decks not listed follow in their usual order */
  order?: string[];
  /** false hides the light/dark button */
  colorToggle?: boolean;
}

const HUB_BASE = 'decks/_hub/';

export interface DeckEntry {
  name: string;
  title: string;
  author?: string;
  date?: string;
  /** deck.json "hidden": the deck is not listed in the gallery (it is still reachable with ?deck=name) */
  hidden?: boolean;
  /** deck.json "thumbnail": an image (relative to the deck folder) shown instead of the live first slide */
  thumbnail?: string;
}

const SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/></svg>';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** to the audience every animation step looks like a slide of its own, so that is what we count */
const countSteps = (deck: Deck) =>
  deck.slides.reduce((n, slide) => n + slide.sections.reduce((m, s) => m + s.stages, 0), 0);

export function showGallery(app: HTMLElement, listed: DeckEntry[], hub: HubMeta = {}) {
  const base = new URL(HUB_BASE, document.baseURI).href;
  registerDeckStyle(hub, base);
  if (hub.css) loadDeckCss(new URL(hub.css, base).href);
  initialTheme(hub.theme);
  const title = hub.title ?? 'slides';
  document.title = title;
  const rank = (d: DeckEntry) => { const i = hub.order?.indexOf(d.name) ?? -1; return i < 0 ? Infinity : i; };
  const entries = [...listed].sort((a, b) => rank(a) - rank(b)); // stable: the rest keeps its order
  const subtitle = hub.subtitle ?? (hub.title ? '' : 'Markdown presentations with code transitions animated by an AST diff');
  app.innerHTML = `
    <div class="gallery align-${hub.align ?? 'start'}"${hub.cardWidth ? ` style="--card-w:${hub.cardWidth}px"` : ''}>
      <header>
        <div class="titles">
          ${hub.logo ? `<img class="logo" src="${esc(fileUrl(HUB_BASE + hub.logo))}" alt="">` : ''}
          <h1>${esc(title)}</h1>
          ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
        </div>
        ${hub.colorToggle === false ? '' : '<button class="scheme-toggle" title="Light / dark" aria-label="Toggle light and dark mode"></button>'}
      </header>
      <div class="cards">${entries.map((d) => `
        <a class="card" href="?deck=${encodeURIComponent(d.name)}" data-deck="${esc(d.name)}">
          <div class="card-thumb">${d.thumbnail
            ? `<img src="${esc(fileUrl(`decks/${d.name}/${d.thumbnail}`))}" alt="">`
            : '<div class="frame"></div>'}</div>
          <div class="card-body">
            <h2>${esc(d.title)}</h2>
            <div class="card-meta">${esc((hub.show ?? ['author', 'date']).filter((k) => k !== 'slides').map((k) => d[k as 'author' | 'date']).filter(Boolean).join(' · '))}</div>
          </div>
        </a>`).join('')}
      </div>
      ${hub.footer ? `<footer>${esc(hub.footer)}</footer>` : ''}
    </div>`;

  const toggle = app.querySelector<HTMLElement>('.scheme-toggle');
  if (toggle) {
    const paint = () => {
      toggle.innerHTML = ['light', 'paper'].includes(document.documentElement.dataset.theme ?? '') ? MOON : SUN;
    };
    paint();
    toggle.onclick = () => { toggleColorScheme(); paint(); };
  }

  for (const d of entries) {
    const card = app.querySelector<HTMLElement>(`.card[data-deck="${CSS.escape(d.name)}"]`)!;
    void fillCard(card, d, hub.show).catch(() => {
      card.classList.add('failed');
    });
  }
}

async function fillCard(card: HTMLElement, entry: DeckEntry, show: HubMeta['show'] = ['author', 'date', 'slides']) {
  const deck = await loadDeck(entry.name);
  const parts = { author: entry.author, date: entry.date, slides: plural(countSteps(deck), 'slide') };
  const meta = show.map((k) => parts[k]).filter(Boolean).join(' · ');
  card.querySelector('.card-meta')!.textContent = meta;

  registerDeckStyle(deck.meta, new URL(`decks/${entry.name}/`, document.baseURI).href);
  if (entry.thumbnail) {
    card.querySelector('.card-thumb')!.classList.add('ready');
    return;
  }
  // thumbnail: a real Player showing the first slide, scaled down
  const first: Deck = { ...deck, slides: deck.slides.slice(0, 1) };
  const steps = await buildSteps(first);
  const thumb = card.querySelector<HTMLElement>('.card-thumb')!;
  const frame = thumb.querySelector<HTMLElement>('.frame')!;
  const W = 1280;
  const H = 720;
  frame.style.cssText = `width:${W}px;height:${H}px`;
  new ResizeObserver(() => { frame.style.transform = `scale(${thumb.clientWidth / W})`; }).observe(thumb);
  await new Player(frame, first, steps, { theme: deck.meta.theme }).start(steps.length - 1); // everything revealed
  thumb.classList.add('ready');
}

export async function loadIndex(): Promise<{ decks: DeckEntry[]; hub: HubMeta }> {
  const idx = (await (await fetch(fileUrl('decks/index.json'))).json()) as { decks: DeckEntry[]; hub?: HubMeta };
  return { decks: idx.decks, hub: idx.hub ?? {} };
}
