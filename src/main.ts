import './style.css';
import { loadDeck } from './deck';
import { fileUrl } from './files';
import { configureGrammars } from './parse';
import { Player } from './player';
import { startPresenterView, CHANNEL } from './presenter';
import { buildSteps } from './steps';
import { openOverview, type Overview } from './overview';
import { startPrintView } from './print';
import { initialTheme, loadDeckCss, nextTheme, registerDeckStyle } from './themes';
import runtimeWasm from 'web-tree-sitter/tree-sitter.wasm?url';

// Grammars are loaded lazily (each is a separate .wasm file) -- only those the deck actually uses.
const GRAMMAR_URLS = import.meta.glob(
  [
    '../node_modules/tree-sitter-wasms/out/tree-sitter-{typescript,tsx,javascript,cpp,c,python,rust,go,java,bash,json,html,css,lua,yaml}.wasm',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;

configureGrammars({
  runtime: fileUrl(runtimeWasm),
  grammar: (lang) => {
    const key = Object.keys(GRAMMAR_URLS).find((k) => k.endsWith(`tree-sitter-${lang}.wasm`));
    if (!key) throw new Error(`brak gramatyki: ${lang}`);
    return fileUrl(GRAMMAR_URLS[key]);
  },
});

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);

async function chooser() {
  const idx = (await (await fetch(fileUrl('decks/index.json'))).json()) as { decks: { name: string; title: string }[] };
  if (idx.decks.length === 1) return idx.decks[0].name;
  app.innerHTML = `<div class="chooser"><h1>slides</h1>${idx.decks
    .map((d) => `<a href="?deck=${encodeURIComponent(d.name)}">${d.title}</a>`)
    .join('')}</div>`;
  return undefined;
}

async function main() {
  initialTheme();
  if (params.has('presenter')) return startPresenterView(app);

  const name = params.get('deck') ?? (await chooser());
  if (!name) return;
  app.textContent = 'loading…';
  const deck = await loadDeck(name);
  initialTheme(deck.meta.theme);
  if (deck.meta.css) loadDeckCss(new URL(`decks/${name}/${deck.meta.css}`, document.baseURI).href);
  document.title = deck.meta.title ?? name;

  registerDeckStyle(deck.meta, new URL(`decks/${name}/`, document.baseURI).href);
  initialTheme(deck.meta.theme);
  const steps = await buildSteps(deck);
  if (params.has("print")) return startPrintView(app, deck, steps, params.get("print") || "slides");
  const player = new Player(app, deck, steps);

  const ch = new BroadcastChannel(CHANNEL);
  const publish = () => ch.postMessage({ type: 'state', state: player.state() });
  player.onChange = (s) => {
    history.replaceState(null, '', `#${s.step + 1}`);
    publish();
  };
  ch.onmessage = (e) => {
    if (e.data?.type === 'cmd') player.go(e.data.step);
    if (e.data?.type === 'hello') publish();
  };

  let overview: Overview | undefined;
  const fromHash = parseInt(location.hash.slice(1), 10);
  await player.start(Number.isFinite(fromHash) ? fromHash - 1 : 0);
  addEventListener('hashchange', () => {
    const n = parseInt(location.hash.slice(1), 10);
    if (Number.isFinite(n) && n - 1 !== player.index) player.go(n - 1);
  });

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': case 'Enter': e.preventDefault(); player.next(); break;
      case 'ArrowLeft': case 'PageUp': case 'Backspace': e.preventDefault(); player.prev(); break;
      case 'Home': player.go(0); break;
      case 'End': player.go(player.length - 1); break;
      case 'f': document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); break;
      case 't': nextTheme(); break;
      case 'p': window.open(`?presenter=1&deck=${encodeURIComponent(name)}`, 'presenter', 'width=900,height=700'); break;
      case 'o': {
        if (overview && !overview.closed) { overview.close(); break; }
        overview = openOverview(deck, steps, player.state().slide, (i) => player.go(i));
        break;
      }
      case 'h': case '?': document.body.classList.toggle('show-help'); break;
    }
  });

  // click: left quarter = back, the rest = forward; swipe on touch
  addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a,video,button,input')) return;
    if (e.clientX < innerWidth * 0.25) player.prev();
    else player.next();
  });
  let x0 = 0;
  addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
  addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) dx < 0 ? player.next() : player.prev();
  });
}

main().catch((e) => {
  app.innerHTML = `<pre class="error">${String(e?.stack ?? e)}</pre>`;
});
