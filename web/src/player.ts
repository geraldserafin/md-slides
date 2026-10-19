// Renderer: tekst sekcji (DOM) + tokeny kodu (span-y animowane przez CSS
// transitions). Pozycja/skala każdego tokenu jest niezależna i liczona w
// pikselach sceny -- znikający token ma ZAMROŻONY transform, więc nie ucieka
// w stronę docelowej pozycji następnego kroku.
import type { Deck, Item } from './deck';
import { layoutBounds } from './layout';
import type { Step } from './steps';
import { tokenClass } from './tokens';

const REF_FONT = 22; // px, bazowy rozmiar tokenów (skalowanych transformem)
const LINE_RATIO = 1.5;
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.6;
const PAD_X = 40;
const MOVE_DELAY = 0.04;
const FADE_IN_DELAY = 0.08;
const DYING_MS = 700;

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
  onChange?: (s: PlayerState) => void;

  constructor(private root: HTMLElement, private deck: Deck, private steps: Step[]) {
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

    const ro = new ResizeObserver(() => this.relayout(true));
    ro.observe(this.stage);
    // obrazki/wideo zmieniają wysokość tekstu po załadowaniu
    this.textLayer.addEventListener('load', () => this.relayout(false), true);
    this.textLayer.addEventListener('loadedmetadata', () => this.relayout(false), true);
  }

  get index() { return this.idx; }
  get length() { return this.steps.length; }

  private measureChar() {
    const probe = document.createElement('span');
    probe.className = 'tok probe';
    probe.style.cssText = `position:absolute;visibility:hidden;font-size:${REF_FONT}px;white-space:pre`;
    probe.textContent = 'M'.repeat(100);
    this.codeLayer.append(probe);
    this.charW = probe.getBoundingClientRect().width / 100 || REF_FONT * 0.6;
    probe.remove();
  }

  async start(initial: number) {
    await document.fonts.load(`${REF_FONT}px "DejaVu Sans Mono"`);
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

  // ---- tekst -----------------------------------------------------------

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
      const r = old.getBoundingClientRect();
      const sr = this.stage.getBoundingClientRect();
      old.classList.add('leaving');
      old.style.cssText = `left:${r.left - sr.left}px;top:${r.top - sr.top}px;width:${r.width}px`;
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
    if (!instant) {
      el.style.opacity = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = '1')));
    }
    this.textLayer.replaceChildren(el);
    this.textEl = el;
    this.stage.classList.toggle('centered', step.centered);
  }

  // ---- kod -------------------------------------------------------------

  private placement(step: Step) {
    const sr = this.stage.getBoundingClientRect();
    const ar = this.codeArea.getBoundingClientRect();
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
    const baseX = ar.left - sr.left + PAD_X +
      (cls.includes('left') ? 0 : cls.includes('right') ? Math.max(0, availW - scaledW) : Math.max(0, availW - scaledW) / 2);
    return { scale, baseX, topY: ar.top - sr.top, lineH };
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
        tk.el.style.setProperty('--d', instant ? '0s' : `${MOVE_DELAY}s`);
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
        el.style.setProperty('--d', instant ? '0s' : `${FADE_IN_DELAY}s`);
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
      }, instant ? 0 : DYING_MS);
    }
  }

  /** Przeliczenie pozycji po zmianie rozmiaru okna / załadowaniu obrazka. */
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
