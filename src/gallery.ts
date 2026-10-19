// Deck gallery (the page shown when several decks are served): a card per deck with a live
// thumbnail of its first slide, the title below it and a quiet line: author · date · slides.
import { loadDeck, type Deck } from './deck';
import { fileUrl } from './files';
import { Player } from './player';
import { buildSteps } from './steps';
import { registerDeckStyle, toggleColorScheme } from './themes';

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

export function showGallery(app: HTMLElement, entries: DeckEntry[]) {
  app.innerHTML = `
    <div class="gallery">
      <header>
        <div>
          <h1>slides</h1>
          <p>Markdown presentations with code transitions animated by an AST diff</p>
        </div>
        <button class="scheme-toggle" title="Light / dark" aria-label="Toggle light and dark mode"></button>
      </header>
      <div class="cards">${entries.map((d) => `
        <a class="card" href="?deck=${encodeURIComponent(d.name)}" data-deck="${esc(d.name)}">
          <div class="card-thumb">${d.thumbnail
            ? `<img src="${esc(fileUrl(`decks/${d.name}/${d.thumbnail}`))}" alt="">`
            : '<div class="frame"></div>'}</div>
          <div class="card-body">
            <h2>${esc(d.title)}</h2>
            <div class="card-meta">${esc([d.author, d.date].filter(Boolean).join(' · '))}</div>
          </div>
        </a>`).join('')}
      </div>
    </div>`;

  const toggle = app.querySelector<HTMLElement>('.scheme-toggle')!;
  const paint = () => {
    toggle.innerHTML = ['light', 'paper'].includes(document.documentElement.dataset.theme ?? '') ? MOON : SUN;
  };
  paint();
  toggle.onclick = () => { toggleColorScheme(); paint(); };

  for (const d of entries) {
    const card = app.querySelector<HTMLElement>(`.card[data-deck="${CSS.escape(d.name)}"]`)!;
    void fillCard(card, d).catch(() => {
      card.classList.add('failed');
    });
  }
}

async function fillCard(card: HTMLElement, entry: DeckEntry) {
  const deck = await loadDeck(entry.name);
  const meta = [entry.author, entry.date, plural(countSteps(deck), 'slide')].filter(Boolean).join(' · ');
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

export async function loadIndex(): Promise<DeckEntry[]> {
  const idx = (await (await fetch(fileUrl('decks/index.json'))).json()) as { decks: DeckEntry[] };
  return idx.decks;
}
