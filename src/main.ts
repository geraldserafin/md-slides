import './style.css';
import 'katex/dist/katex.min.css';
import { loadDeck } from './deck';
import { loadIndex, showGallery } from './gallery';
import { fileUrl, LoadError } from './files';
import { configureGrammars } from './parse';
import { Player } from './player';
import { startPresenterView, CHANNEL } from './presenter';
import { buildSteps } from './steps';
import { plugins } from './plugins';
import { createOverview, type Overview } from './overview';
import { startPrintView } from './print';
import { blackScreen, clearDrawing, drawing, startAutoplay, toggleBlack, toggleDraw, toggleLaser, toggleZoom } from './tools';
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

// ?embed=1 (a preview in the presenter window): listen from the start, the parent may speak before the deck is loaded
type GoMsg = { step: number; instant: boolean };
let embedGo: ((m: GoMsg) => void) | undefined;
let embedPending: GoMsg | undefined;
if (params.has('embed')) {
  addEventListener('message', (e) => {
    if (e.data?.type !== 'go') return;
    if (embedGo) embedGo(e.data);
    else embedPending = e.data;
  });
}

/** the loading spinner (index.html paints the same one before the bundle arrives) */
let loaderLabel = '';
const showLoader = (label = '') => {
  loaderLabel = label;
  app.innerHTML = `<div class="boot"><div class="spinner"></div>${label ? `<div class="label">${label}</div>` : ''}</div>`;
};

/** replace the spinner with the error, so a failure never looks like an endless load */
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const errorScreen = (e: unknown, extra = '') => {
  const err = e as Error;
  const slideMistake = /^[\w.-]+\/[^,]+\.slide, line \d+/.test(err?.message ?? '');
  const title = slideMistake ? 'A slide has a mistake' : e instanceof LoadError ? 'Could not load the deck' : 'Something went wrong';
  const hint = e instanceof LoadError ? e.hint : slideMistake ? 'Fix it in the file; the page reloads when you save.' : undefined;
  app.innerHTML = `<div class="error-box"><h2>${title}</h2><p class="msg">${esc(err?.message ?? String(e))}</p>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}${extra}<details><summary>Details</summary><pre>${esc(String(err?.stack ?? e))}</pre></details></div>`;
};
const showError = (e: unknown) => {
  if (!app.querySelector('.boot')) return;
  errorScreen(e);
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
  if (params.has('presenter')) return startPresenterView(app, params.get('deck') ?? '');

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
  const player = new Player(app, deck, steps, { autoplay: true });

  // ?embed=1: the bare slide, driven by the presenter window's previews (no chrome, no sync channel, no input)
  if (params.has('embed')) {
    document.body.classList.add('embed');
    const at = parseInt(location.hash.slice(1), 10);
    await player.start(Number.isFinite(at) ? at - 1 : 0);
    embedGo = (m) => player.go(m.step, m.instant);
    if (embedPending) embedGo({ ...embedPending, instant: true }); // the parent was quicker than we were
    return;
  }

  const ch = new BroadcastChannel(CHANNEL);
  const publish = () => ch.postMessage({ type: 'state', state: player.state() });
  const pluginApi = { player, deck };
  // the editor's preview follows the cursor: the last step of the slide (or of its section) shows everything revealed
  (window as unknown as { __slideit: unknown }).__slideit = {
    goTo(slide: number, section?: number) {
      let to = -1;
      steps.forEach((st, i) => { if (st.slide === slide && (section === undefined || deck.slides[slide].sections.indexOf(st.section) === section)) to = i; });
      if (to < 0 && section !== undefined) steps.forEach((st, i) => { if (st.slide === slide) to = i; });
      if (to >= 0 && to !== player.state().step) player.go(to);
    },
  };
  player.onChange = (s) => {
    for (const p of plugins) { try { p.hooks?.step?.(pluginApi, { step: s.step, slide: s.slide }); } catch (e) { console.error(`plugin ${p.name}:`, e); } }
    history.replaceState(null, '', `#${s.step + 1}`);
    overview?.setCurrent(s.slide);
    clearDrawing(); // the ink stays on the slide it was drawn on
    publish();
  };
  // the presenter window moves us and ends the show
  ch.onmessage = (e) => {
    const m = e.data;
    if (m?.type === 'cmd') player.go(m.step);
    else if (m?.type === 'hello') publish();
    else if (m?.type === 'end') { if (document.fullscreenElement) void document.exitFullscreen(); location.href = location.pathname; }
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
  // touch screens have no mouse to move: a touch reveals the buttons, too
  const showButtons = () => {
    document.body.classList.add('pointer-active');
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => document.body.classList.remove('pointer-active'), 3500);
  };
  addEventListener('touchstart', showButtons, { passive: true });
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
    { title: 'Black screen (b)', icon: svg('<rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor"/>'), run: toggleBlack, on: blackScreen },
    { title: 'Autoplay (a)', icon: svg('<path d="M7 5l12 7-12 7z" fill="currentColor"/>'), run: () => (autoplay ? stopAuto() : playAuto()), on: () => autoplay },
    ...plugins.flatMap((p) => p.tools ?? []).map((t) => ({ title: t.title, icon: t.icon, run: () => t.run(pluginApi) })),
    { title: 'Help (h)', icon: svg('<path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>'), run: toggleHelp, on: () => document.body.classList.contains('show-help') },
  ];
  // one button; it unfolds the others (a toolbox)
  const toolBar = document.createElement('div');
  toolBar.className = 'tool-bar';
  const main = document.createElement('button');
  main.className = 'tool-btn tool-main';
  main.title = 'Tools';
  main.innerHTML = svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>');
  main.onclick = (e) => { e.stopPropagation(); toolBar.classList.toggle('open'); refreshTools(); };
  toolBar.append(main);
  const toolButtons = tools.map((t, i) => {
    const b = document.createElement('button');
    b.className = 'tool-btn';
    b.title = t.title;
    b.style.setProperty('--i', String(i));
    b.innerHTML = t.icon;
    b.onclick = (e) => { e.stopPropagation(); t.run(); refreshTools(); };
    toolBar.append(b);
    return { b, t };
  });
  const refreshTools = () => {
    toolButtons.forEach(({ b, t }) => b.classList.toggle('on', !!t.on?.()));
    toolBar.classList.toggle('active', toolButtons.some(({ t }) => t.on?.()));
  };
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
      case 'b': case '.': toggleBlack(); break;
      case 'a': autoplay ? stopAuto() : playAuto(); break;
      case 'Escape': if (toolBar.classList.contains('open')) toolBar.classList.remove('open'); else if (drawing()) toggleDraw(); break;
      case 'h': case '?': toggleHelp(); break;
    }
    refreshTools();
  });
  document.addEventListener('fullscreenchange', refreshTools);

  // click: left quarter = back, the rest = forward; swipe on touch
  addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a,video,button,input,.drawer,.draw-layer')) return;
    if (autoplay) stopAuto();
    if (toolBar.classList.contains('open')) { toolBar.classList.remove('open'); return; } // a click on the slide only folds the toolbox
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

main().catch(async (e) => {
  // a deck name that the server does not have: list the ones it has
  let extra = '';
  if (e instanceof LoadError && params.get('deck')) {
    try {
      const idx = (await (await fetch(fileUrl('decks/index.json'))).json()) as { decks: { name: string }[] };
      extra = `<p class="hint">The decks on this server: ${idx.decks.map((d) => `<a href="?deck=${encodeURIComponent(d.name)}">${esc(d.name)}</a>`).join(', ') || '(none)'}</p>`;
    } catch { /* the server cannot even list them */ }
  }
  errorScreen(e, extra);
});
