// Deck gallery (the page shown when several decks are served): a card per deck with a live
// thumbnail of its first slide and metadata (slides, steps, languages, author).
import { loadDeck, type Deck } from './deck';
import { fileUrl } from './files';
import { Player } from './player';
import { buildSteps } from './steps';
import { registerDeckStyle } from './themes';

export interface DeckEntry {
  name: string;
  title: string;
  description?: string;
  author?: string;
  date?: string;
}

const LANG_NAMES: Record<string, string> = {
  typescript: 'TypeScript', tsx: 'TSX', javascript: 'JavaScript', cpp: 'C++', c: 'C', python: 'Python',
  rust: 'Rust', go: 'Go', java: 'Java', bash: 'Bash', json: 'JSON', html: 'HTML', css: 'CSS', lua: 'Lua',
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** counts that do not need parsing: slides, animation steps (frames) and the languages used */
export function deckStats(deck: Deck) {
  let steps = 0;
  const langs = new Set<string>();
  for (const slide of deck.slides)
    for (const s of slide.sections) {
      steps += Math.max(1, s.codes.length);
      if (s.lang) langs.add(s.lang);
    }
  return { slides: deck.slides.length, steps, langs: [...langs].map((l) => LANG_NAMES[l] ?? l) };
}

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
            ${d.description ? `<p>${esc(d.description)}</p>` : ''}
            <div class="card-meta"><span class="dim">loading…</span></div>
          </div>
        </a>`).join('')}
      </div>
    </div>`;

  for (const d of entries) {
    const card = app.querySelector<HTMLElement>(`.card[data-deck="${CSS.escape(d.name)}"]`)!;
    void fillCard(card, d).catch(() => {
      card.querySelector('.card-meta')!.innerHTML = '<span class="dim">preview unavailable</span>';
    });
  }
}

async function fillCard(card: HTMLElement, entry: DeckEntry) {
  const deck = await loadDeck(entry.name);
  const st = deckStats(deck);
  const chips = [plural(st.slides, 'slide'), plural(st.steps, 'step'), ...st.langs.slice(0, 3)];
  if (st.langs.length > 3) chips.push(`+${st.langs.length - 3}`);
  const by = [entry.author, entry.date].filter(Boolean).join(' · ');
  card.querySelector('.card-meta')!.innerHTML =
    chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('') + (by ? `<span class="by">${esc(by)}</span>` : '');

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
