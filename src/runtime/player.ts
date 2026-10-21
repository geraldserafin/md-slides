// The player: it shows a Program, step by step. It knows nothing about what a node is: every element is drawn by the renderer of
// its plugin, every change of what is shown goes through the transition the element asks for, and what a plugin keeps going while
// the show runs (the code plugin draws its tokens) is a service. The player itself does the slide: stage, theme, background, bars,
// the HUD, the steps, the ghost of the slide that leaves, and the timers of the swaps that play by themselves.
import { parseAlign, resolveAlign } from '../align';
import { barVisible, renderSlot, usesSlideNumber, type ChromeBar } from '../chrome';
import { fileUrl } from '../files';
import type { Align, Element, PlayerHost, RenderCtx, ServiceInstance, Slide, Step, TransitionCtx, View } from '../kernel/types.ts';
import type { Deck } from './deck';

const LEAVE_S = 0.16; // s, how fast the previous slide leaves
const SYNC_DELAY = LEAVE_S * 0.65; // s, the new content starts this long after the old one began to leave

/** front matter keys that are shorthand for CSS variables; plain numbers get "px" */
const ALIASES: Record<string, { v: string; px?: boolean }> = {
  'heading-size': { v: '--heading-size', px: true },
  'text-size': { v: '--text-size', px: true },
  spacing: { v: '--item-gap', px: true },
  padding: { v: '--stage-padding', px: true },
  margin: { v: '--stage-padding', px: true },
  gap: { v: '--row-gap', px: true },
  'col-gap': { v: '--col-gap', px: true },
  accent: { v: '--accent' },
  'heading-color': { v: '--heading' },
  'text-color': { v: '--fg' },
};

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

/** the slide on the stage: its DOM and what is known of its views */
interface Mounted {
  index: number;
  slide: Slide;
  grid: HTMLElement;
  views: View[];
  /** which child of each region that plays by itself is on, and which way it is going */
  phase: Map<string, number>;
  dir: Map<string, 1 | -1>;
  /** the views that are shown now */
  shown: Set<View>;
}

/** what moves in a morph: the picture / video / diagram itself (its wrapper spans the whole cell), else the item */
const boxOf = (el: HTMLElement): HTMLElement => (el.classList.contains('item-media') ? (el.firstElementChild as HTMLElement) ?? el : el);

export class Player {
  private idx = -1;
  private cur?: Mounted;
  private slideShown = -1;
  private curTransition = 'fade';
  private counterTimer?: number;
  private ro: ResizeObserver;
  private bgEl?: HTMLElement;
  private slideFadeMs: number;
  private timing: TransitionCtx['timing'];
  private services: ServiceInstance[] = [];
  private timers: number[] = [];
  private defaultTransition: string;
  readonly stage: HTMLElement;
  onChange?: (s: PlayerState) => void;

  /** opts.theme: the theme slides use when they name none (default: the page's theme); opts.autoplay: swaps that play by themselves do (the viewer, not thumbnails or the PDF) */
  constructor(private root: HTMLElement, private deck: Deck, private steps: Step[], private opts: { theme?: string; autoplay?: boolean } = {}) {
    const a = deck.meta.animation ?? {};
    const move = a.move ?? 0.45;
    const fade = a.fade ?? 0.3;
    this.slideFadeMs = (a.slideFade ?? 0.3) * 1000;
    this.defaultTransition = a.textTransition ?? 'fade';
    this.timing = { move, fade, stagger: a.textStagger ?? 0.06, drift: a.textDrift ?? 8, delay: SYNC_DELAY, leave: LEAVE_S };
    const rs = root.style;
    rs.setProperty('--move-dur', `${move}s`);
    rs.setProperty('--fade-dur', `${fade}s`);
    rs.setProperty('--drift', `${this.timing.drift}px`);
    if (a.ease) rs.setProperty('--ease', a.ease);
    for (const [k, v] of Object.entries(deck.meta.vars ?? {})) rs.setProperty(k, v);
    const bar = (kind: 'header' | 'footer') => deck.meta[kind]
      ? `<div class="bar bar-${kind} off"><div class="slot left"></div><div class="slot center"></div><div class="slot right"></div></div>`
      : '';
    root.innerHTML = `
      ${bar('header')}
      <div class="stage"></div>
      ${bar('footer')}
      <div class="hud"><div class="progress"><i></i></div><span class="counter"></span></div>`;
    this.stage = root.querySelector('.stage')!;

    const host: PlayerHost = {
      stage: this.stage, root, program: deck, registry: deck.runtime.registry,
      layer: (name) => {
        let l = this.stage.querySelector<HTMLElement>(`:scope > .${name}-layer`);
        if (!l) { l = document.createElement('div'); l.className = `${name}-layer`; this.stage.append(l); }
        return l;
      },
      visible: (v) => this.isVisible(v),
      relayout: () => this.relayout(false),
      timing: this.timing,
      autoplay: !!opts.autoplay,
    };
    for (const { service } of deck.runtime.services) {
      const inst = service.create?.(host);
      if (inst) this.services.push(inst);
    }
    this.ro = new ResizeObserver(() => this.relayout(true));
    this.ro.observe(this.stage);
  }

  get index() { return this.idx; }
  get length() { return this.steps.length; }

  /** `intro`: the first slide rises and fades in instead of just being there (the loaded deck, not thumbnails) */
  async start(initial: number, intro = false) {
    const family = getComputedStyle(this.stage).getPropertyValue('--font-code').trim() || 'monospace';
    await document.fonts.load(`22px ${family}`).catch(() => []);
    await document.fonts.ready;
    if (intro) this.root.classList.add('intro');
    this.go(initial, true);
    if (intro) {
      void this.root.offsetWidth; // commit the hidden state, then let the transition run
      this.root.classList.replace('intro', 'intro-run');
      setTimeout(() => this.root.classList.remove('intro-run'), 1400);
    }
  }

  go(i: number, instant = false) {
    const j = Math.max(0, Math.min(this.steps.length - 1, i));
    if (j === this.idx && !instant) return;
    const first = this.idx < 0;
    const prev = this.idx;
    this.idx = j;
    const step = this.steps[j];
    const dir = j >= prev ? 1 : -1;
    if (first || step.slide !== this.slideShown || instant) this.changeSlide(step, first || instant, dir);
    else this.changeStage(step, false, dir);
    this.updateHud();
    this.scheduleSwaps();
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

  // ---- visibility: which views are on at a step -------------------------------------------------------------------

  /** is a view on at the current step: its stages, and, in a swap that plays by itself, its turn */
  private isVisible(v: View, stage = this.steps[this.idx]?.stage ?? 0): boolean {
    const e = v.element;
    if (e.children) return true; // containers are always there
    if (e.at > stage || (e.out !== undefined && stage >= e.out)) return false;
    if (e.region && this.cur?.phase.has(e.region)) return this.cur.phase.get(e.region) === e.phase;
    return true;
  }

  private setPending(v: View, pending: boolean, instant: boolean) {
    const el = v.el;
    if (el.classList.contains('pending') === pending) return;
    // inline styles left by an entrance animation would win over the class
    el.style.opacity = '';
    el.style.transform = '';
    el.style.transition = instant ? 'none' : '';
    el.classList.toggle('pending', pending);
    if (instant) requestAnimationFrame(() => { el.style.transition = ''; });
  }

  // ---- slide: layout, theme, background ---------------------------------------------------------------------------

  private applySlide(si: number, instant: boolean) {
    this.slideShown = si;
    const slide: Slide = this.deck.slides[si];
    const m = slide.meta;
    const st = this.stage;
    st.removeAttribute('style');
    st.className = 'stage' + (m.layout ? ` layout-${m.layout}` : '') + (m.class ? ` ${m.class}` : '');
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
      const cfg = this.deck.meta[kind] as ChromeBar | undefined;
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
        old.style.opacity = '0';
        setTimeout(() => old.remove(), this.slideFadeMs + 50);
      }
    }
    if (!bg) return;
    const el = document.createElement('div');
    el.className = 'bg';
    const isImage = /\.(png|jpe?g|gif|svg|webp|avif)(\?.*)?$|^(https?:|data:)/i.test(bg);
    if (/\.(mp4|webm|ogv|mov|m4v)(\?.*)?$/i.test(bg)) {
      // a looping, muted video behind the slide
      const v = document.createElement('video');
      v.src = fileUrl(new URL(bg, base).href);
      v.autoplay = true;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      el.append(v);
    } else if (isImage) {
      const src = new URL(bg, base).href;
      el.style.backgroundImage = `url("${src}")`;
    } else el.style.background = bg;
    if (!instant) {
      el.style.opacity = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = '1')));
    }
    this.root.prepend(el);
    this.bgEl = el;
  }

  /** alignment of the slide: halign / valign (start | center | end) from the slide, else the deck's defaults, else start */
  private applyAlign(slide: Slide) {
    const st = this.stage;
    const src = { own: slide.own, defaults: this.deck.meta.defaults };
    st.dataset.h = resolveAlign('halign', src);
    st.dataset.v = resolveAlign('valign', src);
    const justify = slide.own.justify ?? this.deck.meta.defaults?.justify;
    if (justify && !/^(false|no|off|0)$/i.test(justify)) st.dataset.justify = '';
    else delete st.dataset.justify;
  }

  // ---- building a slide ---------------------------------------------------------------------------------------------

  /** the DOM of the elements of a slide, into `host`; every leaf gets a view */
  private mount(slide: Slide, index: number): Mounted {
    const views: View[] = [];
    const reg = this.deck.runtime;
    const base = new URL(`decks/${this.deck.name}/`, document.baseURI).href;
    const cur: Mounted = { index, slide, grid: document.createElement('div'), views, phase: new Map(), dir: new Map(), shown: new Set() };
    cur.grid.className = 'grid';
    for (const a of slide.autoplay) { cur.phase.set(a.region, 0); cur.dir.set(a.region, 1); }
    this.cur = cur; // visibility reads the phases of the slide being built

    const render = (element: Element, host: HTMLElement, h: Align | undefined, v: Align | undefined, cells: number, inRow: boolean) => {
      const leaf = !element.children;
      const ownH = parseAlign(element.props.align as string | undefined);
      const ownV = parseAlign(element.props.valign as string | undefined);
      // a part of a row is a cell of its own, and so is a leaf that is aligned by itself
      let into = host;
      let ph = h;
      let pv = v;
      // (a swap is one thing to its row: it takes the place of what it shows)
      if ((leaf || element.kind === 'stack') && (inRow || ownH || ownV)) {
        into = document.createElement('div');
        into.className = 'cell text';
        into.style.flex = '1 1 0';
        ph = ownH ?? h;
        pv = ownV ?? v;
        if (ph) into.dataset.h = ph;
        if (pv) into.dataset.v = pv;
        host.append(into);
      }
      const el = document.createElement('div');
      if (leaf) el.className = 'item';
      const view: View = { element, el };
      if (leaf) {
        el.dataset.at = String(element.at);
        if (element.effect) el.dataset.anim = element.effect;
        if (element.key) el.dataset.morph = element.key;
        views.push(view);
      }
      const ctx: RenderCtx = {
        element, el, base, meta: this.deck.meta, registry: reg.registry,
        h: ph, v: pv, cells,
        align: parseAlign,
        relayout: () => this.relayout(false),
        register: (patch) => Object.assign(view, patch),
        children: (target, list, o) => {
          for (const c of list ?? element.children ?? []) render(c, target, o?.h ?? ph, o?.v ?? pv, o?.cells ?? cells, o?.inRow ?? false);
        },
      };
      const draw = reg.render(element.kind);
      if (!draw) {
        el.className = 'item item-unknown';
        el.textContent = `(no renderer for "${element.kind}")`;
      } else {
        try {
          const out = draw(ctx);
          const put = (o: string | Node | void) => { if (typeof o === 'string') el.innerHTML = o; else if (o) el.append(o); };
          if (out instanceof Promise) out.then((o) => { put(o); this.relayout(true); }, (e) => this.renderError(el, element, e));
          else put(out);
        } catch (e) {
          this.renderError(el, element, e);
        }
      }
      into.append(el);
      return view;
    };
    for (const c of slide.root.children ?? []) render(c, cur.grid, undefined, undefined, 1, false);
    return cur;
  }

  private renderError(el: HTMLElement, element: Element, e: unknown) {
    const pre = document.createElement('pre');
    pre.className = 'plugin-error';
    pre.textContent = `${element.kind}: ${e instanceof Error ? e.message : String(e)}`;
    el.replaceChildren(pre);
  }

  // ---- changes ----------------------------------------------------------------------------------------------------

  private px(rect: DOMRect) {
    const sr = this.stage.getBoundingClientRect();
    const k = sr.width / (this.stage.offsetWidth || 1) || 1;
    return { x: (rect.left - sr.left) / k, y: (rect.top - sr.top) / k, w: rect.width / k, h: rect.height / k };
  }

  private ctxFor(base: Pick<TransitionCtx, 'entering' | 'leaving' | 'scope' | 'instant' | 'dir'> & Partial<TransitionCtx>): TransitionCtx {
    const sr = this.stage.getBoundingClientRect();
    const ctx: TransitionCtx = {
      props: {}, timing: this.timing, stage: this.stage,
      scale: sr.width / (this.stage.offsetWidth || 1) || 1,
      show: (v, o) => {
        this.setPending(v, false, ctx.instant);
        if (o?.delay) v.el.style.transitionDelay = `${o.delay}s`;
      },
      hide: (v) => this.setPending(v, true, ctx.instant),
      delegate: (name, entering, leaving) => {
        const run = this.deck.runtime.transition(name) ?? this.deck.runtime.transition('fade');
        return run?.({ ...ctx, entering, leaving });
      },
      px: (r) => this.px(r),
      ...base,
    };
    return ctx;
  }

  /** a step on the same slide: what comes on and what goes off goes through the transition it asks for */
  private changeStage(step: Step, instant: boolean, dir: 1 | -1) {
    const cur = this.cur;
    if (!cur) return;
    const entering: View[] = [];
    const leaving: View[] = [];
    for (const v of cur.views) {
      const now = this.isVisible(v, step.stage);
      const was = cur.shown.has(v);
      if (now && !was) entering.push(v);
      else if (!now && was) leaving.push(v);
    }
    // where the leaving ones were, for the transitions that pair
    for (const v of leaving) v.rect = boxOf(v.el).getBoundingClientRect();
    for (const v of entering) cur.shown.add(v);
    for (const v of leaving) cur.shown.delete(v);
    // each region's own transition; the rest (clicks revealing things) fade
    const groups = new Map<string, { entering: View[]; leaving: View[] }>();
    const into = (v: View, side: 'entering' | 'leaving') => {
      const name = v.element.transition ?? 'fade';
      const key = `${name}|${v.element.region ?? ''}`;
      const g = groups.get(key) ?? { entering: [], leaving: [] };
      g[side].push(v);
      groups.set(key, g);
    };
    entering.forEach((v) => into(v, 'entering'));
    leaving.forEach((v) => into(v, 'leaving'));
    let enter: string | undefined;
    for (const [key, g] of groups) {
      const name = key.split('|')[0];
      enter ??= name;
      const run = this.deck.runtime.transition(name) ?? this.deck.runtime.transition('fade');
      run?.(this.ctxFor({ ...g, scope: 'step', instant, dir, props: {} }));
    }
    for (const s of this.services) s.step?.({ step, slide: cur.slide, entering, leaving, instant, views: cur.views, enter, exit: enter, slideChanged: false });
  }

  /** a slide change: the old slide leaves as a ghost, the new one is built and comes in */
  private changeSlide(step: Step, instant: boolean, dir: 1 | -1) {
    const old = this.cur;
    const slide = this.deck.slides[step.slide];
    const oldTransition = this.curTransition;
    const transition = slide.meta.transition ?? this.defaultTransition;
    // where the keyed things of the old slide were, before anything moves
    const leaving: View[] = old ? old.views.filter((v) => old.shown.has(v)) : [];
    for (const v of leaving) v.rect = boxOf(v.el).getBoundingClientRect();
    let ghost: HTMLElement | undefined;
    if (old && !instant) ghost = this.makeGhost(old);
    else old?.grid.remove();
    for (const s of this.services) s.leave?.();

    this.applySlide(step.slide, instant);
    this.cancelSwaps();
    const cur = this.mount(slide, step.slide);
    const anchor = this.stage.querySelector(':scope > [class$="-layer"]');
    this.stage.insertBefore(cur.grid, anchor);
    cur.grid.addEventListener('load', () => this.relayout(false), true); // images/videos change the height once loaded
    cur.grid.addEventListener('loadedmetadata', () => this.relayout(false), true);
    this.applyAlign(slide);
    this.curTransition = transition;

    // what is shown at this step: the rest waits, hidden
    const entering: View[] = [];
    for (const v of cur.views) {
      if (this.isVisible(v, step.stage)) { cur.shown.add(v); entering.push(v); }
      else v.el.classList.add('pending');
    }
    let keep = LEAVE_S * 1000 + 50;
    if (!instant) {
      const run = this.deck.runtime.transition(transition) ?? this.deck.runtime.transition('fade');
      const ms = run?.(this.ctxFor({ entering, leaving, scope: 'slide', instant: false, dir, ghost, from: oldTransition, props: {} }));
      if (typeof ms === 'number') keep = ms;
    }
    if (ghost) {
      const g = ghost;
      setTimeout(() => g.remove(), keep);
    }
    for (const s of this.services) s.slide?.({ slide, views: cur.views, instant });
    for (const s of this.services) s.step?.({ step, slide, entering, leaving, instant, views: cur.views, enter: transition, exit: oldTransition, slideChanged: true });
    this.updateChrome(step.slide, instant);
  }

  /**
   * Moves the slide that leaves into a "ghost" copy of the stage (same layout classes, inline variables and theme), pinned at its
   * current pixel position, so that it keeps the old look no matter how the stage changes for the next slide. The transition
   * makes it go away.
   */
  private makeGhost(old: Mounted): HTMLElement {
    const ghost = document.createElement('div');
    ghost.className = `${this.stage.className} ghost`;
    // pin the ghost to the stage's current box, so a header/footer change on the next slide cannot move it
    ghost.style.cssText = `${this.stage.style.cssText};top:${this.stage.offsetTop}px;bottom:${this.root.clientHeight - this.stage.offsetTop - this.stage.offsetHeight}px`;
    ghost.dataset.theme = this.root.dataset.theme ?? document.documentElement.dataset.theme ?? 'dark';
    for (const k of ['h', 'v', 'justify']) if (this.stage.dataset[k] !== undefined) ghost.dataset[k] = this.stage.dataset[k];
    const sr = this.stage.getBoundingClientRect();
    const k = sr.width / (this.stage.offsetWidth || 1) || 1;
    // measure BEFORE moving anything, in fractional pixels: even a sub-pixel difference makes the old text hop when the ghost takes over
    const or = old.grid.getBoundingClientRect();
    const opacity = getComputedStyle(old.grid).opacity;
    old.grid.classList.add('leaving');
    old.grid.style.cssText = `left:${(or.left - sr.left) / k}px;top:${(or.top - sr.top) / k}px;width:${or.width / k}px;height:${or.height / k}px;opacity:${opacity}`;
    ghost.append(old.grid);
    this.stage.after(ghost);
    void ghost.offsetWidth;
    return ghost;
  }

  // ---- swaps that play by themselves --------------------------------------------------------------------------------

  private cancelSwaps() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private scheduleSwaps() {
    this.cancelSwaps();
    const cur = this.cur;
    if (!cur || !this.opts.autoplay) return;
    for (const a of cur.slide.autoplay) {
      const tick = () => {
        this.timers.push(window.setTimeout(() => {
          const i = cur.phase.get(a.region) ?? 0;
          const d = cur.dir.get(a.region) ?? 1;
          let to = i + d;
          if (to >= a.count || to < 0) {
            if (!a.loop) return;
            cur.dir.set(a.region, (-d) as 1 | -1);
            to = i - d;
          }
          cur.phase.set(a.region, to);
          this.changeStage(this.steps[this.idx], false, 1);
          tick();
        }, a.seconds * 1000));
      };
      tick();
    }
  }

  // ---- housekeeping -------------------------------------------------------------------------------------------------

  destroy() {
    this.cancelSwaps();
    this.ro.disconnect();
    for (const s of this.services) s.destroy?.();
    this.bgEl?.remove();
  }

  /** Re-layout after a window resize / image load. */
  private relayout(_instant: boolean) {
    if (this.idx < 0) return;
    for (const s of this.services) s.layout?.();
  }
}
