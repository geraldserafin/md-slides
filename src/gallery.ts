// Deck gallery (the page shown when several decks are served): a card per deck with a live
// thumbnail of its first slide, the title below it and a quiet line: author · date · slides.
import { loadDeck, type Deck } from './deck';
import { fileUrl } from './files';
import { Player } from './player';
import { buildSteps } from './steps';
import { registerDeckStyle } from './themes';

export interface DeckEntry {
  name: string;
  title: string;
  author?: string;
  date?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function showGallery(app: HTMLElement, entries: DeckEntry[]) {
  app.innerHTML = `
    <div class="gallery">
      <header>
        <h1>slides</h1>
        <p>Markdown presentations with code transitions animated by an AST diff</p>
      </header>
      <div class="cards">${entries.map((d) => `
        <a class="card" href="?deck=${encodeURIComponent(d.name)}" data-deck="${esc(d.name)}">
          <div class="card-thumb"><div class="frame"></div></div>
          <div class="card-body">
            <h2>${esc(d.title)}</h2>
            <div class="card-meta">${esc([d.author, d.date].filter(Boolean).join(' · '))}</div>
          </div>
        </a>`).join('')}
      </div>
    </div>`;

  for (const d of entries) {
    const card = app.querySelector<HTMLElement>(`.card[data-deck="${CSS.escape(d.name)}"]`)!;
    void fillCard(card, d).catch(() => {
      card.classList.add('failed');
    });
  }
}

async function fillCard(card: HTMLElement, entry: DeckEntry) {
  const deck = await loadDeck(entry.name);
  const meta = [entry.author, entry.date, plural(deck.slides.length, 'slide')].filter(Boolean).join(' · ');
  card.querySelector('.card-meta')!.textContent = meta;

  // thumbnail: a real Player showing the first slide, scaled down
  registerDeckStyle(deck.meta, new URL(`decks/${entry.name}/`, document.baseURI).href);
  const first: Deck = { ...deck, slides: deck.slides.slice(0, 1) };
  const steps = await buildSteps(first);
  const thumb = card.querySelector<HTMLElement>('.card-thumb')!;
  const frame = thumb.querySelector<HTMLElement>('.frame')!;
  const W = 1280;
  const H = 720;
  frame.style.cssText = `width:${W}px;height:${H}px`;
  new ResizeObserver(() => { frame.style.transform = `scale(${thumb.clientWidth / W})`; }).observe(thumb);
  const lastCode = steps.map((s, i) => ({ s, i })).filter((x) => x.s.root).pop();
  await new Player(frame, first, steps, { theme: deck.meta.theme }).start(lastCode ? lastCode.i : 0);
  thumb.classList.add('ready');
}

export async function loadIndex(): Promise<DeckEntry[]> {
  const idx = (await (await fetch(fileUrl('decks/index.json'))).json()) as { decks: DeckEntry[] };
  return idx.decks;
}
