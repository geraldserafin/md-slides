// Renderer: section text (DOM) + code tokens (spans animated by CSS
// transitions). Each token's position/scale is independent and computed in
// stage pixels -- a dying token has a FROZEN transform, so it does not drift
// towards the next step's target position.
import type { Deck, Item, Slide } from './deck';
import { layoutBounds } from './layout';
import type { Step } from './steps';
import { tokenClass } from './tokens';

const REF_FONT = 22; // px, base token size (scaled with a transform)
const LINE_RATIO = 1.5;
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.6;
const PAD_X = 40;

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
  private dyingMs: number;
  private slideFadeMs: number;
  onChange?: (s: PlayerState) => void;

  constructor(private root: HTMLElement, private deck: Deck, private steps: Step[]) {
    const a = deck.meta.animation ?? {};
    this.moveDelay = a.moveDelay ?? 0.04;
    this.fadeInDelay = a.fadeInDelay ?? 0.08;
    const move = a.move ?? 0.45;
    const fade = a.fade ?? 0.3;
    this.dyingMs = (Math.max(move, fade) + 0.25) * 1000;
    this.slideFadeMs = (a.slideFade ?? 0.3) * 1000;
    this.textTransition = a.textTransition ?? 'fade';
    this.textStagger = a.textStagger ?? 0;
    const rs = root.style;
    rs.setProperty("--move-dur", `${move}s`);
    rs.setProperty("--fade-dur", `${fade}s`);
    if (a.ease) rs.setProperty("--ease", a.ease);
    for (const [k, v] of Object.entries(deck.meta.vars ?? {})) rs.setProperty(k, v);
    root.innerHTML = `
      <div class="stage">
        <div class="text-layer"></div>
        <div class="code-area"></div>
        <div class="code-layer"></div>
      </div>
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
    this.idx = j;
    const step = this.steps[j];
    this.applySlide(step.slide, first || instant);
    this.swapText(step, first || instant);
    this.advance(step, first || instant);
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
    if (m.theme) this.root.dataset.theme = m.theme;
    else delete this.root.dataset.theme;
    for (const [k, v] of Object.entries(m)) if (k.startsWith("--")) st.style.setProperty(k, v);
    this.setBackground(m.background, slide.url, instant);
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

  private swapText(step: Step, instant: boolean) {
    if (this.textSection === step.sectionIndex) return;
    this.textSection = step.sectionIndex;
    const old = this.textEl;
    if (old) {
      old.classList.add('leaving');
      old.style.cssText = `left:${this.textLayer.offsetLeft + old.offsetLeft}px;top:${this.textLayer.offsetTop + old.offsetTop}px;width:${old.offsetWidth}px`;
      this.stage.append(old);
      if (instant) old.remove();
      else {
        requestAnimationFrame(() => (old.style.opacity = '0'));
        setTimeout(() => old.remove(), 500);
      }
    }
    const el = document.createElement('div');
    el.className = 'text';
    for (const it of step.section.items) el.append(this.renderItem(it));
    this.textLayer.replaceChildren(el);
    if (!instant) this.enterText(el, this.deck.slides[step.slide].meta);
    this.textEl = el;
    const valign = this.deck.slides[step.slide].meta.valign;
    this.stage.classList.toggle("centered", valign ? valign === "center" || valign === "middle" : step.centered);
  }

  /** Text entrance: fade | slide | slide-left | zoom | none, optionally staggered per element. */
  private enterText(el: HTMLElement, meta: Record<string, string>) {
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
      const d = i * stagger;
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
    const scale = size > 0
      ? size / REF_FONT
      : !fit ? 1
      : Math.max(MIN_SCALE, Math.min(MAX_SCALE, codeW > 0 ? availW / codeW : 1, codeH > 0 ? availH / codeH : 1));
    const scaledW = codeW * scale;
    const cls = step.section.classes;
    const baseX = ar.left + PAD_X +
      (cls.includes('left') ? 0 : cls.includes('right') ? Math.max(0, availW - scaledW) : Math.max(0, availW - scaledW) / 2);
    const side = this.stage.classList.contains("layout-side") || this.stage.classList.contains("layout-side-right");
    const middle = cls.includes("middle") || (side && !cls.includes("top"));
    const topY = ar.top + (middle ? Math.max(0, availH - codeH * scale) / 2 : 0);
    return { scale, baseX, topY, lineH };
  }

  private pos(pl: ReturnType<Player['placement']>, row: number, col: number) {
    return { x: pl.baseX + col * this.charW * pl.scale, y: pl.topY + row * pl.lineH * pl.scale };
  }

  private setTransform(el: HTMLElement, x: number, y: number, s: number) {
    el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }

  private advance(step: Step, instant: boolean) {
    const pl = this.placement(step);
    const seen = new Set<string>();
    for (const p of step.layout) {
      const key = step.keys.get(p.tree.id)!;
      seen.add(key);
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
        tk.el.style.opacity = '1';
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
        el.style.opacity = '1';
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
      }, instant ? 0 : this.dyingMs);
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
