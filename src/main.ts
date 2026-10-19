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
import { clearDrawing, drawing, startAutoplay, toggleDraw, toggleLaser, toggleZoom } from './tools';
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
    clearDrawing(); // the ink stays on the slide it was drawn on
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

  // autoplay: deck.json "autoplay": seconds per step (a slide's own `autoplay:` front matter wins), "loop": true, or ?autoplay=5
  let stopAuto = () => {};
  let autoplay = false;
  const secondsFor = () => {
    const own = parseFloat(deck.slides[player.state().slide].meta.autoplay ?? '');
    return own > 0 ? own : Number(params.get('autoplay')) || deck.meta.autoplay || 5;
  };
  const playAuto = () => {
    stopAuto();
    autoplay = true;
    const stop = startAutoplay(() => {
      if (player.state().step < player.length - 1) { player.next(); return true; }
      if (deck.meta.loop || params.has('loop')) { player.go(0); return true; }
      autoplay = false;
      return false;
    }, secondsFor);
    stopAuto = () => { stop(); autoplay = false; stopAuto = () => {}; };
  };
  if (params.has('autoplay') || deck.meta.autoplay) playAuto();

  const openPresenter = () => window.open(`?presenter=1&deck=${encodeURIComponent(name)}`, 'presenter', 'width=900,height=700');
  const toggleFullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  const toggleHelp = () => document.body.classList.toggle('show-help');

  // the same actions as the keys, as buttons in the top right corner (they show when the mouse moves, like the drawer button)
  const svg = (d: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const tools: { title: string; icon: string; run: () => void; on?: () => boolean }[] = [
    { title: 'Presenter window (p)', icon: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'), run: openPresenter },
    { title: 'Fullscreen (f)', icon: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'), run: toggleFullscreen, on: () => !!document.fullscreenElement },
    { title: 'Theme (t)', icon: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>'), run: nextTheme },
    { title: 'Laser pointer (l)', icon: svg('<circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="8"/>'), run: toggleLaser, on: () => document.body.classList.contains('laser') },
    { title: 'Draw (d, c clears, Esc stops)', icon: svg('<path d="M4 20l1-4L16 5l3 3L8 19z"/>'), run: toggleDraw, on: drawing },
    { title: 'Magnifier (z)', icon: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4M11 8v6M8 11h6"/>'), run: () => toggleZoom(app), on: () => document.body.classList.contains('zoomed') },
    { title: 'Autoplay (a)', icon: svg('<path d="M7 5l12 7-12 7z" fill="currentColor"/>'), run: () => (autoplay ? stopAuto() : playAuto()), on: () => autoplay },
    { title: 'Help (h)', icon: svg('<path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>'), run: toggleHelp, on: () => document.body.classList.contains('show-help') },
  ];
  const toolBar = document.createElement('div');
  toolBar.className = 'tool-bar';
  const toolButtons = tools.map((t) => {
    const b = document.createElement('button');
    b.className = 'tool-btn';
    b.title = t.title;
    b.innerHTML = t.icon;
    b.onclick = (e) => { e.stopPropagation(); t.run(); refreshTools(); };
    toolBar.append(b);
    return { b, t };
  });
  const refreshTools = () => toolButtons.forEach(({ b, t }) => b.classList.toggle('on', !!t.on?.()));
  document.body.append(toolBar);

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (autoplay && e.key !== 'a') stopAuto(); // the presenter takes over
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': case 'Enter': e.preventDefault(); player.next(); break;
      case 'ArrowLeft': case 'PageUp': case 'Backspace': e.preventDefault(); player.prev(); break;
      case 'Home': player.go(0); break;
      case 'End': player.go(player.length - 1); break;
      case 'f': toggleFullscreen(); break;
      case 't': nextTheme(); break;
      case 'p': openPresenter(); break;
      case 'o': toggleDrawer(); break;
      case 'l': toggleLaser(); break;
      case 'd': toggleDraw(); break;
      case 'c': clearDrawing(); break;
      case 'z': toggleZoom(app); break;
      case 'a': autoplay ? stopAuto() : playAuto(); break;
      case 'Escape': if (drawing()) toggleDraw(); break;
      case 'h': case '?': toggleHelp(); break;
    }
    refreshTools();
  });
  document.addEventListener('fullscreenchange', refreshTools);

  // click: left quarter = back, the rest = forward; swipe on touch
  addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a,video,button,input,.drawer,.draw-layer')) return;
    if (autoplay) stopAuto();
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
