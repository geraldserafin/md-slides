import './style.css';
import 'katex/dist/katex.min.css';
import { loadDeck } from './deck';
import { loadIndex, showGallery } from './gallery';
import { fileUrl } from './files';
import { configureGrammars } from './parse';
import { Player } from './player';
import { startPresenterView, CHANNEL } from './presenter';
import { buildSteps } from './steps';
import { createOverview, type Overview } from './overview';
import { startPrintView } from './print';
import { initialTheme, loadDeckCss, nextTheme, preloadDeckFonts, registerDeckStyle } from './themes';
import runtimeWasm from 'web-tree-sitter/tree-sitter.wasm?url';

// Grammars are loaded lazily (each is a separate .wasm file) -- only those the deck actually uses.
const GRAMMAR_URLS = import.meta.glob(
  [
    '../node_modules/tree-sitter-wasms/out/tree-sitter-{typescript,tsx,javascript,cpp,c,python,rust,go,java,bash,json,html,css,lua}.wasm',
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

/** the loading spinner (index.html paints the same one before the bundle arrives) */
let loaderLabel = '';
const showLoader = (label = '') => {
  loaderLabel = label;
  app.innerHTML = `<div class="boot"><div class="spinner"></div>${label ? `<div class="label">${label}</div>` : ''}</div>`;
};

/** replace the spinner with the error, so a failure never looks like an endless load */
const showError = (e: unknown) => {
  if (!app.querySelector('.boot')) return;
  app.innerHTML = `<pre class="error">${String((e as Error)?.stack ?? e).replace(/</g, '&lt;')}</pre>`;
};
addEventListener('unhandledrejection', (e) => showError(e.reason));
addEventListener('error', (e) => showError(e.error ?? e.message));
// a spinner that is still there after a while: say what it is waiting for
setTimeout(() => {
  const boot = app.querySelector('.boot');
  if (boot) boot.insertAdjacentHTML('beforeend', `<div class="label" style="opacity:1">Still working${loaderLabel ? ` (${loaderLabel})` : ''}. If this stays, open the browser console (F12) and reload.</div>`);
}, 12000);

async function chooser() {
  const { decks, hub } = await loadIndex();
  if (decks.length === 1) return decks[0].name;
  showGallery(app, decks.filter((d) => !d.hidden), hub);
  return undefined;
}

async function main() {
  initialTheme();
  if (params.has('presenter')) return startPresenterView(app);

  const name = params.get('deck') ?? (await chooser());
  if (!name) return;
  showLoader('Loading…');
  const deck = await loadDeck(name);
  initialTheme(deck.meta.theme, deck.meta.schemes);
  if (deck.meta.css) loadDeckCss(new URL(`decks/${name}/${deck.meta.css}`, document.baseURI).href);
  document.title = deck.meta.title ?? name;

  registerDeckStyle(deck.meta, new URL(`decks/${name}/`, document.baseURI).href);
  initialTheme(deck.meta.theme, deck.meta.schemes);
  showLoader('Preparing code…');
  await preloadDeckFonts(deck.meta);
  const steps = await buildSteps(deck);
  if (params.has("print")) return startPrintView(app, deck, steps, params.get("print") || "slides");
  const player = new Player(app, deck, steps);

  const ch = new BroadcastChannel(CHANNEL);
  const publish = () => ch.postMessage({ type: 'state', state: player.state() });
  player.onChange = (s) => {
    history.replaceState(null, '', `#${s.step + 1}`);
    overview?.setCurrent(s.slide);
    publish();
  };
  ch.onmessage = (e) => {
    if (e.data?.type === 'cmd') player.go(e.data.step);
    if (e.data?.type === 'hello') publish();
  };

  let overview: Overview | undefined;
  const toggleDrawer = () => overview?.toggle();
  const btn = document.createElement('button');
  btn.className = 'drawer-btn';
  btn.title = 'Slides (o)';
  btn.textContent = '☰';
  btn.onclick = (e) => { e.stopPropagation(); toggleDrawer(); };
  document.body.append(btn);
  let hideTimer: number | undefined;
  addEventListener('mousemove', () => {
    document.body.classList.add('pointer-active');
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => document.body.classList.remove('pointer-active'), 2500);
  });
  const fromHash = parseInt(location.hash.slice(1), 10);
  await player.start(Number.isFinite(fromHash) ? fromHash - 1 : 0, true);
  overview = createOverview(deck, steps, player.state().slide, (i) => player.go(i)); // built in the background
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
      case 'o': toggleDrawer(); break;
      case 'h': case '?': document.body.classList.toggle('show-help'); break;
    }
  });

  // click: left quarter = back, the rest = forward; swipe on touch
  addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a,video,button,input,.drawer')) return;
    if (overview?.isOpen) { overview.close(); return; } // a click on the slide just closes the drawer
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
