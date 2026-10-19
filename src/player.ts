// Renderer: section text (DOM) + code tokens (spans animated by CSS
// transitions). Each token's position/scale is independent and computed in
// stage pixels -- a dying token has a FROZEN transform, so it does not drift
// towards the next step's target position.
import { fenceAlign, place, resolveAlign, type Align } from './align';
import { barVisible, renderSlot, usesSlideNumber, type ChromeBar } from './chrome';
import type { Deck, Item, Slide } from './deck';
import { fileUrl } from './files';
import { layoutBounds } from './layout';
import type { Step } from './steps';
import { tokenClass } from './tokens';

const LEAVE_S = 0.18; // s, fade-out of the previous slide text
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
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.6;
const PAD_X = 0;

interface Token {
  el: HTMLSpanElement;
  dying: boolean;
  timer?: number;
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
  private textEl?: HTMLElement;
  private textSection = -1;
  private counterTimer?: number;
  private leaving = false; // the previous text is fading out
  private charW = 12;
  readonly stage: HTMLElement;
  private textLayer: HTMLElement;
  private codeArea: HTMLElement;
  private codeLayer: HTMLElement;
  private slideShown = -1;
  private ro: ResizeObserver;
  private textTransition: string;
  private textStagger: number;
  private bgEl?: HTMLElement;
  private moveDelay: number;
  private fadeInDelay: number;
  private slideFadeMs: number;
  onChange?: (s: PlayerState) => void;

  /** opts.theme: the theme slides use when their front matter names none (default: the page's theme) */
  constructor(private root: HTMLElement, private deck: Deck, private steps: Step[], private opts: { theme?: string } = {}) {
    const a = deck.meta.animation ?? {};
    this.moveDelay = a.moveDelay ?? 0.04;
    this.fadeInDelay = a.fadeInDelay ?? 0.08;
    const move = a.move ?? 0.45;
    const fade = a.fade ?? 0.3;
    this.slideFadeMs = (a.slideFade ?? 0.3) * 1000;
    this.textTransition = a.textTransition ?? 'fade';
    this.textStagger = a.textStagger ?? 0;
    const rs = root.style;
    rs.setProperty("--move-dur", `${move}s`);
    rs.setProperty("--fade-dur", `${fade}s`);
    if (a.ease) rs.setProperty("--ease", a.ease);
    for (const [k, v] of Object.entries(deck.meta.vars ?? {})) rs.setProperty(k, v);
    const bar = (kind: 'header' | 'footer') => deck.meta[kind]
      ? `<div class="bar bar-${kind} off"><div class="slot left"></div><div class="slot center"></div><div class="slot right"></div></div>`
      : '';
    root.innerHTML = `
      ${bar('header')}
      <div class="stage">
        <div class="text-layer"></div>
        <div class="code-area"></div>
        <div class="code-layer"></div>
      </div>
      ${bar('footer')}
      <div class="hud"><div class="progress"><i></i></div><span class="counter"></span></div>`;
    this.stage = root.querySelector('.stage')!;
    this.textLayer = root.querySelector('.text-layer')!;
    this.codeArea = root.querySelector('.code-area')!;
    this.codeLayer = root.querySelector('.code-layer')!;

    this.ro = new ResizeObserver(() => this.relayout(true));
    this.ro.observe(this.stage);
    // images/videos change the text height once loaded
    this.textLayer.addEventListener('load', () => this.relayout(false), true);
    this.textLayer.addEventListener('loadedmetadata', () => this.relayout(false), true);
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
    const textCut = (this.deck.slides[step.slide].meta.transition ?? this.textTransition) === 'none';
    if (this.textSection !== step.sectionIndex) this.leaveText(first || instant || textCut);
    this.applySlide(step.slide, first || instant);
    this.swapText(step, first || instant);
    this.advance(step, first || instant || cut);
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

  private renderItem(it: Item): HTMLElement {
    const el = document.createElement('div');
    el.className = 'item';
    switch (it.kind) {
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
   * Moves the current text into a "ghost" copy of the current stage (same layout classes, inline
   * variables and theme), pinned at its current pixel position, and fades it out there. The ghost
   * keeps the old look no matter how the stage changes for the next slide.
   */
  private leaveText(instant: boolean) {
    const old = this.textEl;
    if (!old) return;
    this.textEl = undefined;
    if (instant) { old.remove(); return; }
    const ghost = document.createElement('div');
    ghost.className = `${this.stage.className} ghost`;
    // pin the ghost to the stage's current box, so a header/footer change on the next slide cannot move it
    ghost.style.cssText = `${this.stage.style.cssText};top:${this.stage.offsetTop}px;bottom:${this.root.clientHeight - this.stage.offsetTop - this.stage.offsetHeight}px`;
    ghost.dataset.theme = this.root.dataset.theme ?? document.documentElement.dataset.theme ?? 'dark';
    for (const k of ['h', 'v', 'justify']) if (this.stage.dataset[k] !== undefined) ghost.dataset[k] = this.stage.dataset[k];
    // keep the current opacity (the text may still be fading in when the user navigates again)
    const opacity = getComputedStyle(old).opacity;
    // measure BEFORE `.leaving` (position: absolute shrinks the box to its content).
    // Fractional pixels (getBoundingClientRect, undone for a scaled parent), not the rounded offset*: even a
    // sub-pixel difference makes the old text hop when the ghost takes over.
    // As an absolute box the first item's top margin no longer collapses out of it, so pull the box up by it.
    const first = old.firstElementChild;
    const m = first ? parseFloat(getComputedStyle(first).marginTop) || 0 : 0;
    const sr = this.stage.getBoundingClientRect();
    const k = sr.width / (this.stage.offsetWidth || 1) || 1;
    const or = old.getBoundingClientRect();
    const fBefore = first?.getBoundingClientRect();
    const box = `left:${(or.left - sr.left) / k}px;top:${(or.top - sr.top) / k - m}px;width:${or.width / k}px`;
    old.classList.add('leaving');
    old.style.cssText = `${box};opacity:${opacity};transition:opacity ${LEAVE_S}s ease`;
    ghost.append(old);
    this.stage.after(ghost);
    // Whether that first-item margin collapsed out of the box depends on the layout (block child vs flex item),
    // so do not assume: compare where the first item is now with where it was and correct the difference.
    if (first && fBefore) {
      const fAfter = first.getBoundingClientRect();
      const dy = (fBefore.top - fAfter.top) / k;
      const dx = (fBefore.left - fAfter.left) / k;
      if (Math.abs(dy) > 0.01) old.style.top = `${parseFloat(old.style.top) + dy}px`;
      if (Math.abs(dx) > 0.01) old.style.left = `${parseFloat(old.style.left) + dx}px`;
    }
    void old.offsetWidth;
    old.style.opacity = '0';
    setTimeout(() => ghost.remove(), LEAVE_S * 1000 + 50);
    this.leaving = true;
  }

  private swapText(step: Step, instant: boolean) {
    if (this.textSection === step.sectionIndex) return;
    this.textSection = step.sectionIndex;
    const el = document.createElement('div');
    el.className = 'text';
    for (const it of step.section.items) el.append(this.renderItem(it));
    this.textLayer.replaceChildren(el);
    // the new text waits until the old one is (almost) gone, so two headings never overlap
    if (!instant) this.enterText(el, this.deck.slides[step.slide].meta, this.leaving ? LEAVE_S * 0.8 : 0);
    this.leaving = false;
    this.textEl = el;
    this.applyAlign(step);
  }

  /**
   * Alignment of this section: halign / valign (start | center | end, default start) from the slide, or, for a slide that
   * really shows two columns, from the deck's "columns" defaults. The classes tell the CSS which shape the stage has.
   */
  private applyAlign(step: Step) {
    const slide = this.deck.slides[step.slide];
    const layout = slide.meta.layout;
    const twoCol = (layout === 'side' || layout === 'side-right') && !step.textOnly;
    const src = { own: slide.own, defaults: this.deck.meta.defaults, columns: this.deck.meta.columns };
    const st = this.stage;
    st.dataset.h = resolveAlign('halign', src, twoCol);
    st.dataset.v = resolveAlign('valign', src, twoCol);
    const justify = slide.own.justify ?? this.deck.meta.defaults?.justify;
    if (justify && !/^(false|no|off|0)$/i.test(justify)) st.dataset.justify = '';
    else delete st.dataset.justify;
    st.classList.toggle('text-only', step.textOnly);
    st.classList.toggle('two-col', twoCol);
  }

  /** Text entrance: fade | slide | slide-left | zoom | none, optionally staggered per element. */
  private enterText(el: HTMLElement, meta: Record<string, string>, baseDelay = 0) {
    const kind = meta.transition ?? this.textTransition;
    const stagger = (meta.stagger ? parseFloat(meta.stagger) : this.textStagger) || 0;
    if (kind === 'none') return;
    const from: Record<string, string> = {
      fade: '', slide: 'translateY(28px)', 'slide-left': 'translateX(-40px)', zoom: 'scale(0.94)',
    };
    const tf = from[kind] ?? '';
    const targets = stagger > 0 ? [...el.children] as HTMLElement[] : [el];
    targets.forEach((t, i) => {
      t.style.transition = 'none';
      t.style.opacity = '0';
      t.style.transform = tf;
      void t.offsetWidth;
      const d = baseDelay + i * stagger;
      t.style.transition = `opacity var(--fade-dur) ease ${d}s, transform var(--move-dur) var(--ease) ${d}s`;
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

  private placement(step: Step) {
    // offset*: independent of transform: scale() (overview thumbnails)
    const ar = {
      left: this.codeArea.offsetLeft, top: this.codeArea.offsetTop,
      width: this.codeArea.offsetWidth, height: this.codeArea.offsetHeight,
    };
    const availW = Math.max(1, ar.width - 2 * PAD_X);
    const availH = Math.max(1, ar.height);
    const { cols, rows } = layoutBounds(step.layout);
    const lineH = REF_FONT * LINE_RATIO;
    const codeW = cols * this.charW;
    const codeH = rows * lineH;
    const size = parseFloat(step.section.opts.size ?? '');
    const fit = step.section.opts.fit !== 'none';
    // fit to the largest frame of the section, so the font size stays constant across its frames
    let maxCols = cols;
    let maxRows = rows;
    for (const s of this.steps) {
      if (s.sectionIndex !== step.sectionIndex) continue;
      const b = layoutBounds(s.layout);
      maxCols = Math.max(maxCols, b.cols);
      maxRows = Math.max(maxRows, b.rows);
    }
    const fitW = maxCols * this.charW;
    const fitH = maxRows * lineH;
    const scale = size > 0
      ? size / REF_FONT
      : !fit ? 1
      : Math.max(MIN_SCALE, Math.min(MAX_SCALE, fitW > 0 ? availW / fitW : 1, fitH > 0 ? availH / fitH : 1));
    const scaledW = codeW * scale;
    // the code block's own alignment (fence classes / halign= valign=) wins over the slide's
    const fa = fenceAlign(step.section.classes, step.section.opts);
    const hAlign = fa.h ?? (this.stage.dataset.h as Align | undefined) ?? 'start';
    const vAlign = fa.v ?? (this.stage.dataset.v as Align | undefined) ?? 'start';
    const baseX = ar.left + PAD_X + place(hAlign, availW, scaledW);
    const topY = ar.top + place(vAlign, availH, codeH * scale);
    return { scale, baseX, topY, lineH };
  }

  private pos(pl: ReturnType<Player['placement']>, row: number, col: number) {
    return { x: pl.baseX + col * this.charW * pl.scale, y: pl.topY + row * pl.lineH * pl.scale };
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

  private advance(step: Step, instant: boolean) {
    const pl = this.placement(step);
    const focus = this.focusRows(step.focus);
    const dying = this.dyingFor();
    if (instant) this.codeLayer.classList.add('no-anim'); // a cut: no transitions at all
    const seen = new Set<string>();
    for (const p of step.layout) {
      const key = step.keys.get(p.tree.id)!;
      seen.add(key);
      const bright = !focus || focus.has(p.row) ? '1' : '0.25';
      const cls = `tok tok-${tokenClass(p.tree.label)}`;
      const { x, y } = this.pos(pl, p.row, p.col);
      let tk = this.tokens.get(key);
      if (tk) {
        clearTimeout(tk.timer);
        tk.dying = false;
        tk.el.className = cls;
        tk.el.textContent = p.tree.text;
        tk.el.style.setProperty('--d', instant ? '0s' : `${this.moveDelay}s`);
        this.setTransform(tk.el, x, y, pl.scale);
        tk.el.style.opacity = bright;
      } else {
        const el = document.createElement('span');
        el.className = cls;
        el.textContent = p.tree.text;
        el.style.opacity = '0';
        el.style.transition = 'none';
        this.setTransform(el, x, y, pl.scale);
        this.codeLayer.append(el);
        tk = { el, dying: false };
        this.tokens.set(key, tk);
        void el.offsetWidth;
        el.style.transition = '';
        el.style.setProperty('--d', instant ? '0s' : `${this.fadeInDelay}s`);
        el.style.opacity = bright;
      }
    }
    for (const [key, tk] of this.tokens) {
      if (seen.has(key) || tk.dying) continue;
      tk.dying = true;
      tk.el.style.setProperty('--d', '0s');
      tk.el.style.opacity = '0';
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

  /** Re-layout after a window resize / image load. */
  private relayout(instant: boolean) {
    if (this.idx < 0) return;
    const step = this.steps[this.idx];
    if (!step.root) return;
    if (instant) this.codeLayer.classList.add('no-anim');
    const pl = this.placement(step);
    for (const p of step.layout) {
      const tk = this.tokens.get(step.keys.get(p.tree.id)!);
      if (!tk || tk.dying) continue;
      const { x, y } = this.pos(pl, p.row, p.col);
      this.setTransform(tk.el, x, y, pl.scale);
    }
    if (instant) requestAnimationFrame(() => this.codeLayer.classList.remove('no-anim'));
  }
}
