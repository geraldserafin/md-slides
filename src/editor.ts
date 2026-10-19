// Built-in editor (`slides dev` only): the deck's markdown on the left, the live preview on the right.
// Every edit re-parses the deck and rebuilds the preview at the same step; saves go to the dev server,
// which writes the files into the deck folder. Reached with `e` while presenting (?edit=1&deck=name).
import './editor.css';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { buildDeck, type DeckMeta } from './deck';
import { Player } from './player';
import { buildSteps } from './steps';
import { initialTheme, loadDeckCss, preloadDeckFonts, registerDeckStyle } from './themes';

const DECK_JSON = 'deck.json';

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--fg)', backgroundColor: 'var(--bg)', fontSize: '14px' },
  '.cm-content': { fontFamily: 'var(--font-code)', caretColor: 'var(--accent)', padding: '14px 0' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--fg) 6%, transparent)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-scroller': { fontFamily: 'var(--font-code)', lineHeight: '1.6' },
});
const highlight = syntaxHighlighting(HighlightStyle.define([
  { tag: [t.heading, t.heading1, t.heading2, t.heading3], color: 'var(--heading)', fontWeight: '700' },
  { tag: [t.keyword, t.processingInstruction, t.contentSeparator], color: 'var(--tok-keyword)' },
  { tag: [t.string, t.inserted], color: 'var(--tok-builtin)' },
  { tag: [t.link, t.url], color: 'var(--tok-property)' },
  { tag: [t.monospace, t.propertyName], color: 'var(--tok-type)' },
  { tag: [t.comment, t.quote], color: 'var(--tok-comment)', fontStyle: 'italic' },
  { tag: [t.emphasis], fontStyle: 'italic' }, { tag: [t.strong], fontWeight: '700' },
  { tag: [t.number, t.bool, t.null], color: 'var(--tok-builtin)' },
  { tag: [t.meta, t.punctuation], color: 'var(--tok-punct)' },
]));

async function text(url: string): Promise<string | undefined> {
  const r = await fetch(url);
  return r.ok && !/html/.test(r.headers.get('content-type') ?? '') ? r.text() : undefined;
}

export async function startEditor(app: HTMLElement, name: string) {
  const root = new URL(`decks/${name}/`, document.baseURI).href;
  const manifest = (await (await fetch(root + 'manifest.json')).json()) as DeckMeta;
  const files = [...manifest.files];
  const texts = new Map<string, string>();
  await Promise.all(files.map(async (f) => texts.set(f, (await text(root + encodeURI(f))) ?? '')));
  texts.set(DECK_JSON, (await text(root + DECK_JSON)) ?? '{}\n');
  const canSave = (await fetch('/__slides/ping').then((r) => r.ok, () => false));

  app.innerHTML = `
    <div class="ed">
      <header class="ed-bar">
        <a class="ed-present" title="Present from here">▶ Present</a>
        <span class="ed-name"></span>
        <button class="ed-nav" data-d="-1" title="Previous slide">‹</button>
        <select class="ed-files"></select>
        <button class="ed-nav" data-d="1" title="Next slide">›</button>
        <button class="ed-new" title="New slide">＋</button>
        <span class="ed-status"></span>
      </header>
      <div class="ed-main">
        <div class="ed-left"></div>
        <div class="ed-gutter"></div>
        <div class="ed-right">
          <div class="ed-stage"></div>
          <div class="ed-ctl"><button data-s="-1">◀</button><span class="ed-pos"></span><button data-s="1">▶</button></div>
        </div>
      </div>
    </div>`;
  const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
  const select = $<HTMLSelectElement>('.ed-files');
  const status = $('.ed-status');
  const stageBox = $('.ed-stage');
  const pos = $('.ed-pos');
  $('.ed-name').textContent = name;
  if (!canSave) status.textContent = 'read-only: start the page with `slides dev`';

  // ---- files ---------------------------------------------------------------
  let current = files[0];
  const fillSelect = () => {
    select.innerHTML = [...files, DECK_JSON].map((f) => `<option value="${f}">${f}</option>`).join('');
    select.value = current;
  };
  fillSelect();

  // ---- saving --------------------------------------------------------------
  const dirty = new Set<string>();
  let saveTimer: number | undefined;
  const flush = async () => {
    clearTimeout(saveTimer);
    if (!canSave) return;
    for (const f of [...dirty]) {
      dirty.delete(f);
      try {
        const r = await fetch(`/__slides/file?deck=${encodeURIComponent(name)}&file=${encodeURIComponent(f)}`, { method: 'PUT', body: texts.get(f) });
        if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
        if (!dirty.size) status.textContent = 'Saved';
      } catch (e) {
        dirty.add(f);
        status.textContent = `Save failed: ${(e as Error).message}`;
      }
    }
  };
  const touch = (f: string) => {
    dirty.add(f);
    if (canSave) status.textContent = 'Editing…';
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flush, 600);
  };

  // ---- the editor ----------------------------------------------------------
  const states = new Map<string, EditorState>();
  const stateFor = (f: string) => {
    let s = states.get(f);
    if (!s) {
      s = EditorState.create({
        doc: texts.get(f) ?? '',
        extensions: [
          basicSetup, f === DECK_JSON ? json() : markdown(), theme, highlight, EditorView.lineWrapping,
          keymap.of([indentWithTab, { key: 'Mod-s', preventDefault: true, run: () => { void flush(); return true; } }]),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            texts.set(f, u.state.doc.toString());
            touch(f);
            schedule();
          }),
        ],
      });
      states.set(f, s);
    }
    return s;
  };
  const view = new EditorView({ state: stateFor(current), parent: $('.ed-left') });

  // ---- the preview ---------------------------------------------------------
  let player: Player | undefined;
  let frame: HTMLElement | undefined;
  let deckSteps: { first: number; count: number }[] = [];
  let offset = 0; // the step inside the current slide: kept while the text is edited
  let lastMeta = '';
  let lastCss: string | undefined;
  let lastGood: DeckMeta = { ...manifest };

  const slideIndex = () => Math.max(0, files.indexOf(current));
  const fit = () => {
    if (!frame) return;
    const k = Math.min(stageBox.clientWidth / innerWidth, stageBox.clientHeight / innerHeight);
    frame.style.transform = `scale(${k})`;
    frame.style.left = `${(stageBox.clientWidth - innerWidth * k) / 2}px`;
    frame.style.top = `${(stageBox.clientHeight - innerHeight * k) / 2}px`;
  };

  const rebuild = async () => {
    let meta = lastGood;
    const raw = texts.get(DECK_JSON) ?? '{}';
    try {
      meta = { title: name, ...JSON.parse(raw), files } as DeckMeta;
      lastGood = meta;
    } catch (e) {
      status.textContent = `deck.json: ${(e as Error).message}`;
    }
    if (raw !== lastMeta) {
      lastMeta = raw;
      registerDeckStyle(meta, root);
      initialTheme(meta.theme);
      if (meta.css && meta.css !== lastCss) { lastCss = meta.css; loadDeckCss(new URL(meta.css, root).href); }
      await preloadDeckFonts(meta);
    }
    const deck = buildDeck(name, meta, files.map((f) => texts.get(f) ?? ''), root);
    const steps = await buildSteps(deck);
    deckSteps = deck.slides.map((_, si) => {
      const first = steps.findIndex((s) => s.slide === si);
      return { first, count: steps.filter((s) => s.slide === si).length };
    });
    const at = deckSteps[slideIndex()];
    const step = at.first + Math.min(offset, at.count - 1);

    const next = document.createElement('div');
    next.className = 'ed-frame';
    next.style.cssText = `width:${innerWidth}px;height:${innerHeight}px`;
    stageBox.append(next);
    const p = new Player(next, deck, steps);
    p.onChange = (s) => {
      const f = files[s.slide];
      const info = deckSteps[s.slide];
      offset = s.step - info.first;
      pos.textContent = `${f}  ·  step ${offset + 1}/${info.count}`;
      if (f !== current) selectFile(f, false);
    };
    await p.start(step);
    player?.destroy();
    frame?.remove();
    player = p;
    frame = next;
    fit();
  };

  let busy = false;
  let again = false;
  let timer: number | undefined;
  const run = async () => {
    if (busy) { again = true; return; }
    busy = true;
    try {
      do {
        again = false;
        await rebuild();
        if (canSave && !dirty.size && status.textContent?.startsWith('Preview')) status.textContent = '';
      } while (again);
    } catch (e) {
      status.textContent = `Preview: ${(e as Error).message}`;
    } finally {
      busy = false;
    }
  };
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(run, 250); };

  // ---- wiring --------------------------------------------------------------
  function selectFile(f: string, toStart = true) {
    if (f === current) return;
    current = f;
    states.set(prevFile, view.state);
    prevFile = f;
    view.setState(stateFor(f));
    select.value = f;
    if (f !== DECK_JSON && toStart && player) {
      offset = 0;
      player.go(deckSteps[files.indexOf(f)].first, true);
    }
  }
  let prevFile = current;
  select.onchange = () => selectFile(select.value);
  app.querySelectorAll<HTMLElement>('.ed-nav').forEach((b) => (b.onclick = () => {
    const i = files.indexOf(current) + Number(b.dataset.d);
    if (files[i]) selectFile(files[i]);
  }));
  app.querySelectorAll<HTMLElement>('.ed-ctl button').forEach((b) => (b.onclick = () => {
    if (!player) return;
    Number(b.dataset.s) > 0 ? player.next() : player.prev();
  }));
  $('.ed-new').onclick = () => {
    const raw = prompt('New slide file name', `${String(files.length + 1).padStart(2, '0')}-new.md`);
    if (!raw) return;
    const f = /\.md$/i.test(raw) ? raw : `${raw}.md`;
    if (texts.has(f) || /[\\/]/.test(f)) { status.textContent = 'That name is taken or invalid'; return; }
    files.push(f);
    files.sort();
    texts.set(f, '# New slide\n\n');
    fillSelect();
    touch(f);
    selectFile(f, false);
    schedule();
  };
  $<HTMLAnchorElement>('.ed-present').onclick = async () => {
    await flush();
    location.href = `?deck=${encodeURIComponent(name)}#${(player?.state().step ?? 0) + 1}`;
  };

  // draggable split
  const left = $('.ed-left');
  const saved = Number(localStorage.getItem('slides-editor-split'));
  if (saved > 20 && saved < 80) left.style.flexBasis = `${saved}%`;
  $('.ed-gutter').onpointerdown = (e) => {
    const main = $('.ed-main');
    const move = (m: PointerEvent) => {
      const pct = Math.min(75, Math.max(25, ((m.clientX - main.getBoundingClientRect().left) / main.clientWidth) * 100));
      left.style.flexBasis = `${pct}%`;
      try { localStorage.setItem('slides-editor-split', String(Math.round(pct))); } catch { /* ignore */ }
      fit();
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    e.preventDefault();
  };
  new ResizeObserver(fit).observe(stageBox);
  addEventListener('beforeunload', (e) => { if (dirty.size) { void flush(); e.preventDefault(); } });

  await run();
  view.focus();
}
