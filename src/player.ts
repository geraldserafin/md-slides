// Renderer: section text (DOM) + code tokens (spans animated by CSS
// transitions). Each token's position/scale is independent and computed in
// stage pixels -- a dying token has a FROZEN transform, so it does not drift
// towards the next step's target position.
import { fenceAlign, parseAlign, place, resolveAlign, type Align } from './align';
import { barVisible, renderSlot, usesSlideNumber, type ChromeBar } from './chrome';
import type { Block, CodeStyle, Deck, Item, Section, Slide } from './deck';
import { fileUrl } from './files';
import type { Step } from './steps';
import { tokenClass } from './tokens';

const LEAVE_S = 0.16; // s, fade-out of the previous slide text
const SYNC_DELAY = LEAVE_S * 0.65; // s, new text / code start this long after the old one began to leave
const REF_FONT = 22; // px, base token size (scaled with a transform)
const LINE_RATIO = 1.5;

/** front matter keys that are shorthand for CSS variables; plain numbers get "px" */
const ALIASES: Record<string, { v: string; px?: boolean }> = {
  'heading-size': { v: '--heading-size', px: true },
  'text-size': { v: '--text-size', px: true },
  spacing: { v: '--item-gap', px: true },
  padding: { v: '--stage-padding', px: true },
  split: { v: '--split' },
  accent: { v: '--accent' },
  'heading-color': { v: '--heading' },
  'text-color': { v: '--fg' },
};
const SLIDE_PX = 60; // px, how far content travels for `transition: slide-right` / `slide-left`
/** direction of travel of a text transition: +1 = to the right, -1 = to the left, 0 = none */
const slideDir = (kind: string) => (kind === 'slide-right' ? 1 : kind === 'slide-left' ? -1 : 0);
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.6;

/** how one animated code block looks: from the deck defaults ("code" in deck.json) and the block's own fence options */
interface BlockCfg {
  panel: boolean; // a background box around the code
  bg?: string; // its color (default: --code-bg)
  lines: boolean; // line numbers
  start: number; // the number of the first line
  title?: string; // a caption above the code, e.g. a file name
  radius?: string;
  pad?: string;
}

interface BlockView {
  block: Block;
  row: number; // the grid row it sits in
  cells: number; // how many cells that row has
  cellH?: Align; // the cell's own alignment (`||| halign=end valign=center`)
  cellV?: Align;
  wrap: HTMLElement; // .code-block (panel, title)
  box: HTMLElement; // .code-box: the exact area the tokens are drawn in
  cfg: BlockCfg;
  scale: number; // font scale of the block
  cols: number; // widest frame, in characters
  rows: number; // tallest frame
}

const flag = (b: Block, ...names: string[]) => names.some((n) => b.classes.includes(n));

function blockCfg(b: Block, d: CodeStyle = {}): BlockCfg {
  const o = b.opts;
  const bgOpt = o.bg ?? (d.bg !== undefined ? String(d.bg) : undefined);
  const panel = flag(b, 'nopanel', 'nobg') || o.bg === 'none' ? false
    : flag(b, 'panel', 'bg') || !!bgOpt && bgOpt !== 'none';
  const bg = bgOpt && bgOpt !== 'panel' && bgOpt !== 'none' ? bgOpt : undefined;
  const lines = flag(b, 'nolines') || o.lines === 'false' ? false : flag(b, 'lines') || o.lines === 'true' || d.lines === true;
  const radius = o.radius ?? (d.radius !== undefined ? String(d.radius) : undefined);
  return {
    panel, bg, lines, start: parseInt(o.start ?? '1', 10) || 1, title: o.title,
    radius: radius && /^\d+(\.\d+)?$/.test(radius) ? `${radius}px` : radius, pad: o.pad ?? d.pad,
  };
}

interface Token {
  el: HTMLSpanElement;
  dying: boolean;
  timer?: number;
  pos?: { x: number; y: number; s: number }; // where it is drawn (to slide it out)
}

export interface PlayerState {
  step: number;
  steps: number;
  slide: number;
  slides: number;
  stepInSlide: number;
  stepsInSlide: number;
  title: string;
  notes: string[];
  nextTitle?: string;
  nextNotes: string[];
}

export class Player {
  private idx = -1;
  private tokens = new Map<string, Token>();
  private gridEl?: HTMLElement; // the grid (rows of cells) of the section on screen
  private headEl?: HTMLElement; // the slide's head (a level 1 heading above its sections)
  private headSlide = -1;
  private curSlideKind = 'fade'; // the `transition` of the slide on screen (how it leaves when the slide changes)
  private enterKind = 'fade'; // how the text of the step being shown comes in
  private textSection = -1;
  private counterTimer?: number;
  private leaving = false; // the previous text is fading out
  private charW = 12;
  readonly stage: HTMLElement;
  private view?: { section: Section; blocks: BlockView[]; items: { el: HTMLElement; at: number }[] }; // the section on screen
  private codeLayer: HTMLElement;
  private slideShown = -1;
  private ro: ResizeObserver;
  private textTransition: string;
  private textStagger: number;
  private textDrift: number;
  private sectionTransition?: string;
  private bgEl?: HTMLElement;
  private moveDelay: number;
  private fadeInDelay: number;
  private slideFadeMs: number;
  onChange?: (s: PlayerState) => void;

  /** opts.theme: the theme slides use when their front matter names none (default: the page's theme) */
  constructor(private root: HTMLElement, private deck: Deck, private steps: Step[], private opts: { theme?: string } = {}) {
    const a = deck.meta.animation ?? {};
    this.moveDelay = a.moveDelay ?? 0.04;
    this.fadeInDelay = a.fadeInDelay ?? 0.12;
    const move = a.move ?? 0.45;
    const fade = a.fade ?? 0.3;
    this.slideFadeMs = (a.slideFade ?? 0.3) * 1000;
    this.textTransition = a.textTransition ?? 'fade';
    this.textStagger = a.textStagger ?? 0.06;
    this.textDrift = a.textDrift ?? 8;
    this.sectionTransition = a.sectionTransition;
    const rs = root.style;
    rs.setProperty("--move-dur", `${move}s`);
    rs.setProperty("--fade-dur", `${fade}s`);
    rs.setProperty("--drift", `${this.textDrift}px`);
    if (a.ease) rs.setProperty("--ease", a.ease);
    for (const [k, v] of Object.entries(deck.meta.vars ?? {})) rs.setProperty(k, v);
    const bar = (kind: 'header' | 'footer') => deck.meta[kind]
      ? `<div class="bar bar-${kind} off"><div class="slot left"></div><div class="slot center"></div><div class="slot right"></div></div>`
      : '';
    root.innerHTML = `
      ${bar('header')}
      <div class="stage">
        <div class="code-layer"></div>
      </div>
      ${bar('footer')}
      <div class="hud"><div class="progress"><i></i></div><span class="counter"></span></div>`;
    this.stage = root.querySelector('.stage')!;
    this.codeLayer = root.querySelector('.code-layer')!;

    this.ro = new ResizeObserver(() => this.relayout(true));
    this.ro.observe(this.stage);
  }

  get index() { return this.idx; }
  get length() { return this.steps.length; }

  private measureChar() {
    const probe = document.createElement('span');
    probe.className = 'tok probe';
    probe.style.cssText = `position:absolute;visibility:hidden;font-size:${REF_FONT}px;white-space:pre`;
    probe.textContent = 'M'.repeat(1000);
    this.codeLayer.append(probe);
    // offsetWidth (not getBoundingClientRect): independent of a parent's transform: scale() (thumbnails)
    this.charW = probe.offsetWidth / 1000 || REF_FONT * 0.6;
    probe.remove();
  }

  async start(initial: number) {
    const family = getComputedStyle(this.stage).getPropertyValue('--font-code').trim() || 'monospace';
    await document.fonts.load(`${REF_FONT}px ${family}`).catch(() => []);
    await document.fonts.ready;
    this.measureChar();
    this.go(initial, true);
  }

  go(i: number, instant = false) {
    const j = Math.max(0, Math.min(this.steps.length - 1, i));
    if (j === this.idx && !instant) return;
    const first = this.idx < 0;
    const prev = this.idx;
    this.idx = j;
    const step = this.steps[j];
    // a pair of neighbouring steps uses the later one's transition, so going back mirrors going forward
    const cut = !first && this.steps[Math.abs(j - prev) === 1 ? Math.max(j, prev) : j].transition === 'none';
    // the old text must be frozen BEFORE the stage switches layout/theme, or it jumps while fading
    // `transition: none` (per slide or deck-wide) means a hard cut for the text: the old text goes away at once, too
    // Transitions are granular: `transition` is for the slide as a whole (when the slide changes), `section-transition`
    // for the swaps between its ## sections (default: the same as the slide's). The head of a slide takes no part in the latter.
    const meta = this.deck.slides[step.slide].meta;
    const slideKind = meta.transition ?? this.textTransition;
    const sameSlide = step.slide === this.headSlide;
    const sectionKind = meta['section-transition'] ?? this.sectionTransition ?? slideKind;
    const enterKind = sameSlide ? sectionKind : slideKind;
    const exitKind = sameSlide ? sectionKind : this.curSlideKind;
    const textCut = enterKind === 'none';
    const sectionChanged = this.textSection !== step.sectionIndex;
    // content that travels (slide-right / slide-left): the old one leaves in that direction, the new one comes in from the other side
    const exitDir = sectionChanged && !first && !instant ? slideDir(exitKind) : 0;
    const enterDir = sectionChanged && !first && !instant ? slideDir(enterKind) : 0;
    if (sectionChanged) this.leaveText(first || instant || textCut, !sameSlide, exitDir);
    this.applySlide(step.slide, first || instant);
    this.enterKind = enterKind;
    this.swapText(step, first || instant);
    this.curSlideKind = slideKind;
    this.applyStage(step, first || instant);
    this.advance(step, first || instant || cut, -enterDir * SLIDE_PX, exitDir * SLIDE_PX);
    this.updateHud();
    this.onChange?.(this.state());
  }

  next() { this.go(this.idx + 1); }
  prev() { this.go(this.idx - 1); }

  state(): PlayerState {
    const st = this.steps[this.idx];
    const inSlide = this.steps.filter((s) => s.slide === st.slide);
    const slide = this.deck.slides[st.slide];
    const nextSlide = this.deck.slides[st.slide + 1];
    return {
      step: this.idx, steps: this.steps.length,
      slide: st.slide, slides: this.deck.slides.length,
      stepInSlide: inSlide.indexOf(st), stepsInSlide: inSlide.length,
      title: slide.title, notes: slide.notes,
      nextTitle: nextSlide?.title, nextNotes: nextSlide?.notes ?? [],
    };
  }

  private updateHud() {
    const bar = this.root.querySelector<HTMLElement>('.progress i')!;
    bar.style.width = `${((this.idx + 1) / this.steps.length) * 100}%`;
    this.root.querySelector('.counter')!.textContent = `${this.steps[this.idx].slide + 1} / ${this.deck.slides.length}`;
  }

  // ---- slide: layout, theme, background ------------------------------

  private applySlide(si: number, instant: boolean) {
    if (si === this.slideShown) return;
    this.slideShown = si;
    const slide: Slide = this.deck.slides[si];
    const m = slide.meta;
    const st = this.stage;
    st.removeAttribute("style");
    st.className = "stage" + (m.layout ? ` layout-${m.layout}` : "") + (m.class ? ` ${m.class}` : "");
    delete st.dataset.h;
    delete st.dataset.v;
    delete st.dataset.justify;
    const theme = m.theme ?? this.opts.theme;
    if (theme) this.root.dataset.theme = theme;
    else delete this.root.dataset.theme;
    for (const [k, v] of Object.entries(m)) {
      if (k.startsWith('--')) st.style.setProperty(k, v);
      else if (ALIASES[k]) st.style.setProperty(ALIASES[k].v, ALIASES[k].px && /^\d+(\.\d+)?$/.test(v) ? `${v}px` : v);
    }
    this.setBackground(m.background, slide.url, instant);
    this.updateChrome(si, instant);
  }

  /** header / footer: visibility on this slide, size, colors and the slots' content */
  private updateChrome(si: number, instant = false) {
    const meta = this.deck.slides[si].meta;
    const base = new URL(`decks/${this.deck.name}/`, document.baseURI);
    const ctx = {
      slide: si + 1, slides: this.deck.slides.length, title: this.deck.meta.title ?? this.deck.name,
      slideTitle: this.deck.slides[si].title, author: this.deck.meta.author, date: this.deck.meta.date,
    };
    let ownCounter = false; // the bars show the slide number, so the built-in counter would be a duplicate
    for (const kind of ['header', 'footer'] as const) {
      const cfg: ChromeBar | undefined = this.deck.meta[kind];
      const el = this.root.querySelector<HTMLElement>(`.bar-${kind}`);
      if (!cfg || !el) continue;
      const show = barVisible(cfg, meta, kind);
      const h = cfg.height ?? 40;
      el.classList.toggle('off', !show); // fades out/in
      // the space stays reserved even when the bar is hidden: a stage that resizes between slides makes everything jump
      this.root.style.setProperty(`--${kind}-h`, `${h}px`);
      el.style.height = `${h}px`;
      el.style.setProperty('--bar-img-h', `${Math.round(h * 0.6)}px`);
      el.style.background = cfg.background ?? '';
      el.style.color = cfg.color ?? '';
      el.classList.toggle('bordered', !!cfg.border);
      if (show && usesSlideNumber(cfg)) ownCounter = true;
      for (const pos of ['left', 'center', 'right'] as const)
        renderSlot(el.querySelector<HTMLElement>(`.slot.${pos}`)!, cfg[pos], ctx, (s) => fileUrl(new URL(s, base).href));
    }
    // the built-in counter returns only once the footer has faded out (no two numbers on top of each other)
    clearTimeout(this.counterTimer);
    if (ownCounter) this.root.classList.add('own-counter');
    else if (instant) this.root.classList.remove('own-counter');
    else this.counterTimer = window.setTimeout(() => this.root.classList.remove('own-counter'), 320);
  }

  private setBackground(bg: string | undefined, base: string, instant: boolean) {
    const old = this.bgEl;
    this.bgEl = undefined;
    if (old) {
      if (instant) old.remove();
      else {
        old.style.opacity = "0";
        setTimeout(() => old.remove(), this.slideFadeMs + 50);
      }
    }
    if (!bg) return;
    const el = document.createElement("div");
    el.className = "bg";
    const isImage = /\.(png|jpe?g|gif|svg|webp|avif)(\?.*)?$|^(https?:|data:)/i.test(bg);
    if (isImage) {
      const src = new URL(bg, base).href;
      el.style.backgroundImage = `url("${src}")`;
    } else el.style.background = bg;
    if (!instant) {
      el.style.opacity = "0";
      requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = "1")));
    }
    this.root.prepend(el);
    this.bgEl = el;
  }

  // ---- text ------------------------------------------------------------

  private renderItem(it: Item, section: Section, views: BlockView[], row: number, cells: number): HTMLElement {
    const el = document.createElement('div');
    el.className = 'item';
    switch (it.kind) {
      case 'block': {
        el.classList.add('item-block');
        const block = section.blocks[it.block];
        const cfg = blockCfg(block, this.deck.meta.code);
        const wrap = document.createElement('div');
        wrap.className = 'code-block' + (cfg.panel ? ' panel' : '');
        if (cfg.bg) wrap.style.background = cfg.bg;
        if (cfg.radius) wrap.style.borderRadius = cfg.radius;
        if (cfg.pad && cfg.panel) wrap.style.padding = cfg.pad;
        if (cfg.title) {
          const t = document.createElement('div');
          t.className = 'code-title';
          t.textContent = cfg.title;
          wrap.append(t);
        }
        const box = document.createElement('div');
        box.className = 'code-box';
        wrap.append(box);
        el.append(wrap);
        views.push({ block, row, cells, wrap, box, cfg, scale: 1, cols: 1, rows: 1 });
        break;
      }
      case 'html':
        el.classList.add(`item-${it.tag}`);
        el.innerHTML = it.html;
        break;
      case 'code': {
        el.classList.add('item-code');
        const pre = document.createElement('pre');
        pre.textContent = it.text;
        el.append(pre);
        break;
      }
      case 'image': {
        el.classList.add('item-media');
        const img = document.createElement('img');
        img.src = it.src;
        img.alt = it.alt;
        this.styleMedia(el, img, it.attrs.classes, it.attrs.opts);
        el.append(img);
        break;
      }
      case 'video': {
        el.classList.add('item-media');
        const v = document.createElement('video');
        v.src = it.src;
        const o = it.attrs.opts;
        v.controls = o.controls !== 'false';
        v.muted = o.muted === 'true' || o.autoplay === 'true';
        v.loop = o.loop === 'true';
        v.autoplay = o.autoplay === 'true';
        v.playsInline = true;
        this.styleMedia(el, v, it.attrs.classes, o);
        el.append(v);
        break;
      }
    }
    return el;
  }

  private styleMedia(wrap: HTMLElement, media: HTMLElement, classes: string[], opts: Record<string, string>) {
    wrap.classList.add(...classes);
    if (opts.width) media.style.width = opts.width;
    if (opts.height) media.style.height = opts.height;
  }

  /**
   * Moves the current grid into a "ghost" copy of the current stage (same layout classes, inline variables and
   * theme), pinned at its current pixel position, and fades it out there. The ghost keeps the old look no matter
   * how the stage changes for the next slide.
   */
  private leaveText(instant: boolean, withHead: boolean, exitDir = 0) {
    const olds = [this.gridEl, withHead ? this.headEl : undefined].filter((e): e is HTMLElement => !!e);
    this.gridEl = undefined;
    if (withHead) this.headEl = undefined;
    if (!olds.length) return;
    if (instant) { olds.forEach((o) => o.remove()); return; }
    const ghost = document.createElement('div');
    ghost.className = `${this.stage.className} ghost`;
    // pin the ghost to the stage's current box, so a header/footer change on the next slide cannot move it
    ghost.style.cssText = `${this.stage.style.cssText};top:${this.stage.offsetTop}px;bottom:${this.root.clientHeight - this.stage.offsetTop - this.stage.offsetHeight}px`;
    ghost.dataset.theme = this.root.dataset.theme ?? document.documentElement.dataset.theme ?? 'dark';
    for (const k of ['h', 'v', 'justify']) if (this.stage.dataset[k] !== undefined) ghost.dataset[k] = this.stage.dataset[k];
    const sr = this.stage.getBoundingClientRect();
    const k = sr.width / (this.stage.offsetWidth || 1) || 1;
    // measure BEFORE moving anything, in fractional pixels (getBoundingClientRect, undone for a scaled parent): even a
    // sub-pixel difference makes the old text hop when the ghost takes over. Keep the current opacity (the text
    // may still be fading in when the user navigates again).
    const infos = olds.map((old) => ({ old, or: old.getBoundingClientRect(), opacity: getComputedStyle(old).opacity }));
    for (const { old, or, opacity } of infos) {
      old.classList.add('leaving');
      old.style.cssText = `left:${(or.left - sr.left) / k}px;top:${(or.top - sr.top) / k}px;width:${or.width / k}px;height:${or.height / k}px;opacity:${opacity};transition:opacity ${LEAVE_S}s ease-out, transform ${LEAVE_S}s ease-out`;
      ghost.append(old);
    }
    this.stage.after(ghost);
    void ghost.offsetWidth;
    // the old text fades out while lifting away a little; the new text rises into place (see enterText)
    for (const { old } of infos) {
      old.style.opacity = '0';
      old.style.transform = exitDir ? `translateX(${exitDir * SLIDE_PX}px)` : `translateY(${-this.textDrift * 0.6}px)`;
    }
    setTimeout(() => ghost.remove(), LEAVE_S * 1000 + 50);
    this.leaving = true;
  }

  /** Track sizes from the front matter ("auto", "1fr", "2fr", "40%", "12em") as a CSS flex value. */
  private trackFlex(t: string | undefined, dflt: string): string {
    const v = (t ?? dflt).trim();
    if (v === 'auto') return '0 0 auto'; // never shrink below its content: a row that is too tall overflows (and the code scales down) instead of overlapping
    const fr = /^(\d*\.?\d+)fr$/.exec(v);
    if (fr) return `${fr[1]} 1 0`;
    return `0 0 ${v}`;
  }

  private swapText(step: Step, instant: boolean) {
    if (this.textSection === step.sectionIndex) return;
    this.textSection = step.sectionIndex;
    const sec = step.section;
    const meta = this.deck.slides[step.slide].meta;
    const views: BlockView[] = [];
    const items: { el: HTMLElement; at: number }[] = [];
    // widest / tallest frame of every block, from the steps of this section (a stable box across its frames)
    const metrics = new Map<Block, { cols: number; rows: number }>();
    for (const st of this.steps) if (st.section === sec) for (const bs of st.blocks) metrics.set(bs.block, { cols: bs.cols, rows: bs.rows });

    // the grid: rows (front matter `rows:`) of cells (`cols:`, or `split:` for two); one row fills the slide
    const rowTracks = (meta.rows ?? '').split(/\s+/).filter(Boolean);
    const colTracks = (meta.cols ?? '').split(/\s+/).filter(Boolean);
    // the slide's head: a level 1 heading above its sections; it stays while the sections below swap
    const slide = this.deck.slides[step.slide];
    const headItems: { el: HTMLElement; at: number }[] = [];
    if (this.headSlide !== step.slide) {
      this.headSlide = step.slide;
      if (slide.head.length) {
        const head = document.createElement('div');
        head.className = 'head';
        for (const it of slide.head) {
          const e = this.renderItem(it, sec, views, 0, 1);
          headItems.push({ el: e, at: 0 });
          head.append(e);
        }
        this.stage.insertBefore(head, this.codeLayer);
        this.headEl = head;
      }
    }
    const grid = document.createElement('div');
    grid.className = 'grid';
    sec.rows.forEach((cells, r) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      rowEl.style.flex = this.trackFlex(rowTracks[r], sec.rows.length === 1 ? '1fr' : 'auto');
      cells.forEach((list, c) => {
        const cellEl = document.createElement('div');
        cellEl.className = 'cell text';
        const co = sec.cellOpts[r]?.[c] ?? {};
        const split = cells.length === 2 && !colTracks.length && meta.split ? [meta.split, '1fr'] : colTracks;
        // `||| span=2` makes the cell twice as wide as one with span 1 (unless cols: says otherwise)
        cellEl.style.flex = co.span && !split[c] ? `${parseFloat(co.span) || 1} 1 0` : this.trackFlex(split[c], '1fr');
        const cellH = parseAlign(co.halign);
        const cellV = parseAlign(co.valign);
        if (cellH) cellEl.dataset.h = cellH;
        if (cellV) cellEl.dataset.v = cellV;
        const first = views.length;
        for (const it of list) {
          const e = this.renderItem(it, sec, views, r, cells.length);
          e.dataset.at = String(it.at);
          if (it.at > step.stage) e.classList.add('pending');
          items.push({ el: e, at: it.at });
          cellEl.append(e);
        }
        for (const v of views.slice(first)) { v.cellH = cellH; v.cellV = cellV; }
        rowEl.append(cellEl);
      });
      grid.append(rowEl);
    });
    this.stage.insertBefore(grid, this.codeLayer);
    grid.addEventListener('load', () => this.relayout(false), true); // images/videos change the height once loaded
    grid.addEventListener('loadedmetadata', () => this.relayout(false), true);
    this.gridEl = grid;
    // the new text waits until the old one is (almost) gone, so two headings never overlap
    if (!instant) this.enterText([...headItems, ...items.filter((i) => i.at <= step.stage)].map((i) => i.el), this.enterKind, meta, this.leaving ? SYNC_DELAY : 0);
    for (const v of views) {
      const m = metrics.get(v.block);
      v.cols = m?.cols ?? 1;
      v.rows = m?.rows ?? 1;
    }
    this.view = { section: sec, blocks: views, items };
    this.leaving = false;
    this.applyAlign(step);
  }

  /** Reveal: show what the current stage includes, hide what comes later (also when going back). */
  private applyStage(step: Step, instant: boolean) {
    const view = this.view;
    if (!view) return;
    for (const { el, at } of view.items) {
      const pending = at > step.stage;
      if (el.classList.contains('pending') === pending) continue;
      // inline styles left by the entrance animation would win over the class
      el.style.opacity = '';
      el.style.transform = '';
      el.style.transition = instant ? 'none' : '';
      el.classList.toggle('pending', pending);
      if (instant) requestAnimationFrame(() => { el.style.transition = ''; });
    }
  }

  /**
   * Alignment of this section: halign / valign (start | center | end, default start) from the slide, or, for a slide that
   * has several cells in a row, from the deck's "columns" defaults. The classes tell the CSS which shape the stage has.
   */
  private applyAlign(step: Step) {
    const slide = this.deck.slides[step.slide];
    // "columns" = the classic two-column slide: a single row of cells. A grid of several rows starts at the top.
    const columns = step.section.rows.length === 1 && step.section.rows[0].length > 1;
    const textOnly = step.section.blocks.length === 0;
    const src = { own: slide.own, defaults: this.deck.meta.defaults, columns: this.deck.meta.columns, textOnly: this.deck.meta.textOnly };
    const ctx = { twoColumns: columns, textOnly };
    const st = this.stage;
    st.dataset.h = resolveAlign('halign', src, ctx);
    st.dataset.v = resolveAlign('valign', src, ctx);
    const justify = slide.own.justify ?? this.deck.meta.defaults?.justify;
    if (justify && !/^(false|no|off|0)$/i.test(justify)) st.dataset.justify = '';
    else delete st.dataset.justify;
    st.classList.toggle('text-only', textOnly);
    st.classList.toggle('has-cols', columns);
  }

  /** Text entrance: fade | slide | slide-left | zoom | none, optionally staggered per element. */
  private enterText(els: HTMLElement[], kind: string, meta: Record<string, string>, baseDelay = 0) {
    // content that travels moves as one piece (text and code in step), so no stagger
    const stagger = slideDir(kind) ? 0 : (meta.stagger ? parseFloat(meta.stagger) : this.textStagger) || 0;
    if (kind === 'none') return;
    const from: Record<string, string> = {
      fade: this.textDrift ? `translateY(${this.textDrift}px)` : '', slide: 'translateY(28px)', 'slide-right': `translateX(${-SLIDE_PX}px)`, 'slide-left': `translateX(${SLIDE_PX}px)`, zoom: 'scale(0.94)',
    };
    const tf = from[kind] ?? '';
    els.forEach((t, i) => {
      t.style.transition = 'none';
      t.style.opacity = '0';
      t.style.transform = tf;
      void t.offsetWidth;
      const d = baseDelay + i * stagger;
      t.style.transition = `opacity calc(var(--fade-dur) * 1.3) ease-out ${d}s, transform var(--move-dur) var(--ease) ${d}s`;
      t.style.opacity = '1';
      t.style.transform = 'none';
    });
  }

  destroy() {
    this.ro.disconnect();
    for (const tk of this.tokens.values()) clearTimeout(tk.timer);
    this.bgEl?.remove();
  }

  // ---- code ------------------------------------------------------------

  /**
   * Size every code block of the section: the font scale fits the widest frame into the column (never above
   * MAX_SCALE), then, if a column's content is taller than the column, all blocks in it shrink to fit (never below MIN_SCALE).
   * The block's box gets the exact height of its tallest frame, so the text around it never moves between frames.
   */
  private layoutBlocks() {
    const view = this.view;
    if (!view) return;
    const lineH = REF_FONT * LINE_RATIO;
    const apply = (v: BlockView, s: number) => {
      v.scale = s;
      const gutter = v.cfg.lines ? (String(v.cfg.start + v.rows - 1).length + 1.5) * this.charW * s : 0;
      v.box.style.height = `${v.rows * lineH * s}px`;
      v.box.style.paddingLeft = `${gutter}px`;
    };
    for (const v of view.blocks) {
      const size = parseFloat(v.block.opts.size ?? '');
      const fit = v.block.opts.fit !== 'none';
      const cs = getComputedStyle(v.wrap);
      const W = v.wrap.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const g = v.cfg.lines ? String(v.cfg.start + v.rows - 1).length + 1.5 : 0;
      apply(v, size > 0 ? size / REF_FONT : !fit ? 1 : Math.max(MIN_SCALE, Math.min(MAX_SCALE, W / ((v.cols + g) * this.charW) || 1)));
    }
    // blocks in cells next to each other share one font size (the smallest that fits), so they can be compared
    const sideBySide = view.blocks.filter((v) => v.cells > 1 && !(parseFloat(v.block.opts.size ?? '') > 0) && v.block.opts.fit !== 'none');
    if (sideBySide.length > 1) {
      const smallest = Math.min(...sideBySide.map((v) => v.scale));
      for (const v of sideBySide) apply(v, smallest);
    }
    // a grid taller than the stage: shrink the (fittable) blocks
    const grid = this.gridEl;
    if (grid) {
      const mine = view.blocks.filter((v) => !(parseFloat(v.block.opts.size ?? '') > 0) && v.block.opts.fit !== 'none');
      for (let pass = 0; pass < 4; pass++) {
        const over = grid.scrollHeight - grid.clientHeight;
        if (over <= 1) break;
        const codeH = mine.reduce((sum, v) => sum + v.rows * lineH * v.scale, 0);
        if (!codeH) break;
        // the rows stack, so shrinking every block by the same factor removes about that share of the overflow
        const f = Math.max(0.3, 1 - over / codeH);
        let changed = false;
        for (const v of mine) if (v.scale > MIN_SCALE) { apply(v, Math.max(MIN_SCALE, v.scale * f)); changed = true; }
        if (!changed) break;
      }
    }
  }

  private setTransform(el: HTMLElement, x: number, y: number, s: number) {
    el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }

  /** "2-4,7" (1-based lines) -> set of 0-based rows; undefined = no focus */
  private focusRows(spec: string | undefined): Set<number> | undefined {
    if (!spec) return undefined;
    const rows = new Set<number>();
    for (const part of spec.split(',')) {
      const [a, b = a] = part.trim().split('-').map((n) => parseInt(n, 10));
      if (Number.isFinite(a) && Number.isFinite(b)) for (let r = a; r <= b; r++) rows.add(r - 1);
    }
    return rows.size ? rows : undefined;
  }

  /** how long a fading token must stay in the DOM: the stage's own durations (slides may override them) */
  private dyingFor(): number {
    const secs = (name: string, fallback: number) => {
      const v = getComputedStyle(this.stage).getPropertyValue(name).trim();
      const n = parseFloat(v);
      return Number.isFinite(n) ? (v.endsWith('ms') ? n / 1000 : n) : fallback;
    };
    return (Math.max(secs('--move-dur', 0.45), secs('--fade-dur', 0.3)) + 0.25) * 1000;
  }

  private advance(step: Step, instant: boolean, enterDx = 0, exitDx = 0) {
    this.layoutBlocks(); // the geometry may have changed (resize, a late image, a font)
    const dying = this.dyingFor();
    if (instant) this.codeLayer.classList.add('no-anim'); // a cut: no transitions at all
    const sr = this.stage.getBoundingClientRect();
    const k = sr.width / (this.stage.offsetWidth || 1) || 1; // a scaled parent (thumbnails)
    const lineH = REF_FONT * LINE_RATIO;
    const seen = new Set<string>();

    const put = (key: string, text: string, cls: string, x: number, y: number, scale: number, opacity: string) => {
      seen.add(key);
      let tk = this.tokens.get(key);
      if (tk) {
        clearTimeout(tk.timer);
        tk.dying = false;
        tk.el.className = cls;
        tk.el.textContent = text;
        tk.el.style.transition = '';
        tk.el.style.setProperty('--d', instant ? '0s' : `${this.moveDelay}s`);
        this.setTransform(tk.el, x, y, scale);
        tk.el.style.opacity = opacity;
        tk.pos = { x, y, s: scale };
      } else {
        const el = document.createElement('span');
        el.className = cls;
        el.textContent = text;
        el.style.opacity = '0';
        el.style.transition = 'none';
        this.setTransform(el, x + enterDx, y, scale); // a sliding section starts a bit to the side
        this.codeLayer.append(el);
        tk = { el, dying: false, pos: { x, y, s: scale } };
        this.tokens.set(key, tk);
        void el.offsetWidth;
        el.style.transition = '';
        el.style.setProperty('--d', instant ? '0s' : `${enterDx ? SYNC_DELAY : this.fadeInDelay}s`);
        if (enterDx) this.setTransform(el, x, y, scale);
        el.style.opacity = opacity;
      }
    };

    for (const st of step.blocks) {
      const v = this.view?.blocks.find((b) => b.block === st.block);
      if (!v) continue;
      const s = v.scale;
      const br = v.box.getBoundingClientRect();
      const cs = getComputedStyle(v.box);
      const padL = parseFloat(cs.paddingLeft) || 0;
      // the box sits in an item that may be mid-entrance (translated): measure where it will rest, not where it is now
      const sh = this.translation(v.box);
      const x0 = (br.left - sr.left) / k - sh.dx;
      const y0 = (br.top - sr.top) / k - sh.dy;
      const innerW = v.box.clientWidth - padL;
      const boxH = v.box.clientHeight;
      // the block's own alignment (fence classes / halign= valign=) wins over the slide's
      const fa = fenceAlign(v.block.classes, v.block.opts);
      const hAlign = fa.h ?? v.cellH ?? (this.stage.dataset.h as Align | undefined) ?? 'start';
      const vAlign = fa.v ?? v.cellV ?? 'start';
      const rows = st.layout.reduce((m, p) => Math.max(m, p.row + 1), 1);
      const xs = x0 + padL + place(hAlign, innerW, st.cols * this.charW * s);
      const ys = y0 + place(vAlign, boxH, rows * lineH * s);
      const focus = this.focusRows(st.focus);
      if (v.cfg.lines) {
        const digits = String(v.cfg.start + v.rows - 1).length;
        for (let r = 0; r < rows; r++) {
          const num = String(v.cfg.start + r);
          put(`${st.groupKey}|ln${r}`, num, 'tok tok-ln', x0 + (digits - num.length) * this.charW * s, ys + r * lineH * s, s, !focus || focus.has(r) ? '0.45' : '0.12');
        }
      }
      for (const p of st.layout) {
        put(st.keys.get(p.tree.id)!, p.tree.text, `tok tok-${tokenClass(p.tree.label)}`, xs + p.col * this.charW * s, ys + p.row * lineH * s, s, !focus || focus.has(p.row) ? '1' : '0.25');
      }
    }

    for (const [key, tk] of this.tokens) {
      if (seen.has(key) || tk.dying) continue;
      tk.dying = true;
      tk.el.classList.add('dying'); // fades out faster than new code fades in: old and new code hardly overlap
      tk.el.style.setProperty('--d', '0s');
      tk.el.style.opacity = '0';
      if (exitDx && tk.pos && !instant) {
        // leaving with a sliding section: drift out to the side while fading
        tk.el.style.transition = `opacity ${LEAVE_S}s ease-out, transform ${LEAVE_S}s ease-out`; // as fast as the text leaves
        this.setTransform(tk.el, tk.pos.x + exitDx, tk.pos.y, tk.pos.s);
      }
      tk.timer = window.setTimeout(() => {
        tk.el.remove();
        if (this.tokens.get(key) === tk) this.tokens.delete(key);
      }, instant ? 0 : dying);
    }
    if (instant) {
      void this.codeLayer.offsetWidth; // apply the styles without transitions before re-enabling them
      this.codeLayer.classList.remove('no-anim');
    }
  }

  /** the translation (CSS px) applied to `el` by itself and its ancestors up to the stage (entrance animations) */
  private translation(el: HTMLElement): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;
    for (let e: HTMLElement | null = el; e && e !== this.stage; e = e.parentElement) {
      const t = getComputedStyle(e).transform;
      if (!t || t === 'none') continue;
      const m = new DOMMatrixReadOnly(t);
      dx += m.m41;
      dy += m.m42;
    }
    return { dx, dy };
  }

  /** Re-layout after a window resize / image load. */
  private relayout(instant: boolean) {
    if (this.idx < 0) return;
    this.advance(this.steps[this.idx], instant);
  }
}
