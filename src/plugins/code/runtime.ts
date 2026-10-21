// The DOM side of the code plugin. The states of an animated block (the `code`s of a swap, or blocks that share an `id`) are parsed
// with tree-sitter, their syntax trees matched with GumTree, and the matching gives every token of every state a key: the same key
// is the same DOM element from one state to the next, so a CSS transition can move it. Each token's position and scale are
// independent and computed in stage pixels; a dying token has a FROZEN transform, so it does not drift towards the next target.
import { fenceAlign, place, type Align } from '../../align';
import type { Element, PlayerHost, PluginRuntime, Program, Registry, Service, ServiceInstance, Step, View } from '../../kernel/types.ts';
import { walk } from '../../kernel/lower.ts';
import { slideDir } from '../core-transitions/runtime.ts';
import { match, type Matching, type Tree } from './gumtree.ts';
import { layoutBounds, layoutLeaves, type Placed } from './layout.ts';
import { langFromTag, parseOne, type Lang } from './parse.ts';
import { tokenClass } from './tokens.ts';

const REF_FONT = 22; // px, base token size (scaled with a transform)
const LINE_RATIO = 1.5;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.2;
const SLIDE_PX = 60; // px, how far content travels for `slide-right` / `slide-left`
const LEAVE_S = 0.16;
const SYNC_DELAY = LEAVE_S * 0.65;

/** how one animated code block looks: from the deck defaults (`code-style`) and the block's own properties */
interface BlockCfg {
  panel: boolean; // a background box around the code
  bg?: string; // its color (default: --code-bg)
  lines: boolean; // line numbers
  start: number; // the number of the first line
  title?: string; // a caption above the code, e.g. a file name
  radius?: string;
  pad?: string;
}

type CodeProps = { lang: string; text: string; animated: boolean; focus?: string; classes: string[]; opts: Record<string, string> };

/** one state of an animated block, parsed and keyed */
interface CodeState {
  element: Element;
  /** what makes two states one animation */
  groupKey: string;
  grammar: Lang;
  root: Tree;
  layout: Placed[];
  cols: number; // the widest state of the block on its slide (a stable box)
  rows: number;
  focus?: string;
  transition: 'morph' | 'fade' | 'none'; // how this state is entered
  keys: Map<number, string>; // treeId -> token key (namespaced by the group)
  link?: { to: CodeState; m: Matching | 'same' }; // to the same group in the next step
  /** a block that plays by itself: all its states (this one is the first) */
  cycle?: CodeState[];
}

/** what the service knows of the code on the steps (set by `prepare`, shared by every player of the same steps) */
const states = new WeakMap<Element, CodeState>();
const blocksOf = new WeakMap<Step, CodeState[]>();

const props = (e: Element) => e.props as unknown as CodeProps;
const flag = (p: CodeProps, ...names: string[]) => names.some((n) => p.classes.includes(n));

function blockCfg(p: CodeProps, d: { bg?: string; lines?: boolean; radius?: number | string; pad?: string } = {}): BlockCfg {
  const o = p.opts;
  const bgOpt = o.bg ?? (d.bg !== undefined ? String(d.bg) : undefined);
  const panel = flag(p, 'nopanel', 'nobg') || o.bg === 'none' ? false : flag(p, 'panel', 'bg') || (!!bgOpt && bgOpt !== 'none');
  const bg = bgOpt && bgOpt !== 'panel' && bgOpt !== 'none' ? bgOpt : undefined;
  const lines = flag(p, 'nolines') || o.lines === 'false' ? false : flag(p, 'lines') || o.lines === 'true' || d.lines === true;
  const radius = o.radius ?? (d.radius !== undefined ? String(d.radius) : undefined);
  return {
    panel, bg, lines, start: parseInt(o.start ?? '1', 10) || 1, title: o.title,
    radius: radius && /^\d+(\.\d+)?$/.test(radius) ? `${radius}px` : radius, pad: o.pad ?? d.pad,
  };
}

const parseTransition = (v: string | undefined): CodeState['transition'] => (v === 'fade' || v === 'none' ? v : 'morph');

/** every animated code element of a slide, grouped by key, in the order they appear */
function groupsOf(program: Program, si: number): Map<string, Element[]> {
  const groups = new Map<string, Element[]>();
  for (const e of walk(program.slides[si].root)) {
    if (e.kind !== 'code' || !props(e).animated || !e.key) continue;
    (groups.get(e.key) ?? groups.set(e.key, []).get(e.key)!).push(e);
  }
  for (const g of groups.values()) g.sort((a, b) => a.at - b.at || (a.phase ?? 0) - (b.phase ?? 0));
  return groups;
}

const grammarOf = (registry: Registry, tag: string): Lang | undefined => registry.language(tag) ?? langFromTag(tag);

const service: Service = {
  async prepare(program, steps, registry) {
    const hidden = new Set(program.slides.map((s, i) => (/^(true|yes|on|1)$/i.test(s.meta.hidden ?? '') ? i : -1)).filter((i) => i >= 0));
    const cycles = new Map<string, CodeState[]>();
    // 1. every state is parsed once (tabs -> 4 spaces: the monospace grid has no notion of tab stops)
    const slideGroups: Map<string, Element[]>[] = [];
    for (let si = 0; si < program.slides.length; si++) {
      const groups = groupsOf(program, si);
      slideGroups.push(groups);
      if (hidden.has(si)) continue;
      for (const [key, els] of groups) {
        let cols = 0;
        let rows = 0;
        const made: CodeState[] = [];
        for (const e of els) {
          const p = props(e);
          const grammar = grammarOf(registry, p.lang);
          if (!grammar) continue;
          const code = p.text.replace(/\t/g, '    ');
          const root = await parseOne(grammar, code);
          const layout = layoutLeaves(code, root);
          const b = layoutBounds(layout);
          cols = Math.max(cols, b.cols);
          rows = Math.max(rows, b.rows);
          made.push({
            element: e, groupKey: key, grammar, root, layout, cols: 0, rows: 0, focus: p.focus, transition: parseTransition(e.transition), keys: new Map(),
          });
        }
        for (const s of made) { s.cols = cols; s.rows = rows; states.set(s.element, s); }
        // a swap that plays by itself: its states are a cycle the viewer's timer walks
        const slide = program.slides[si];
        if (made.length > 1 && slide.autoplay.some((a) => a.region === made[0].element.region)) {
          const cyc = made.map((s) => ({ ...s, keys: new Map() }));
          cyc.forEach((s, k) => {
            states.set(s.element, s);
            s.cycle = cyc;
            const next = cyc[k + 1];
            if (next && next.transition === 'morph' && s.grammar === next.grammar) s.link = { to: next, m: match(s.root, next.root) };
          });
          cycles.set(`${si}:${key}`, cyc);
        }
      }
    }
    // 2. what is on each step: the state of every block that is there
    steps.forEach((step) => {
      if (hidden.has(step.slide)) return;
      const out: CodeState[] = [];
      for (const [key, els] of slideGroups[step.slide]) {
        const cyc = cycles.get(`${step.slide}:${key}`);
        if (cyc) { const e0 = cyc[0].element; if (e0.at <= step.stage && (e0.out === undefined || step.stage < e0.out)) out.push(cyc[0]); continue; }
        const shown = els.filter((e) => e.at <= step.stage && (e.out === undefined || step.stage < e.out));
        const e = shown[shown.length - 1];
        const s = e && states.get(e);
        if (s) out.push(s);
      }
      blocksOf.set(step, out);
    });
    // 3. link every state to the same group in the next step (matched when the code changed, identical when not)
    steps.forEach((step, i) => {
      const prevStep = steps[i - 1];
      if (!prevStep) return;
      const prev = blocksOf.get(prevStep) ?? [];
      for (const cur of blocksOf.get(step) ?? []) {
        if (cur.cycle) continue;
        const before = prev.find((b) => b.groupKey === cur.groupKey);
        if (!before) continue;
        if (before.element === cur.element) before.link = { to: cur, m: 'same' };
        else if (cur.transition === 'morph' && before.grammar === cur.grammar) before.link = { to: cur, m: match(before.root, cur.root) };
      }
    });
    // 4. keys are computed from the end: a node inherits its partner's key from the next step
    const assign = (st: CodeState, tag: number) => {
      const link = st.link;
      const collect = (t: Tree) => {
        const partner = link ? (link.m === 'same' ? t.id : link.m.get(t.id)) : undefined;
        st.keys.set(t.id, (partner !== undefined && link!.to.keys.get(partner)) || `${st.groupKey}|k${tag}_${t.id}`);
        t.children.forEach(collect);
      };
      collect(st.root);
    };
    for (let i = steps.length - 1; i >= 0; i--) for (const st of blocksOf.get(steps[i]) ?? []) if (!st.cycle) assign(st, i);
    for (const cyc of cycles.values()) for (let k = cyc.length - 1; k >= 0; k--) assign(cyc[k], k);
  },

  create(host: PlayerHost): ServiceInstance {
    interface Token { el: HTMLSpanElement; dying: boolean; timer?: number; pos?: { x: number; y: number; s: number } }
    interface CodeView { view: View; wrap: HTMLElement; box: HTMLElement; cfg: BlockCfg; cells: number; cellH?: Align; cellV?: Align; scale: number; cols: number; rows: number }
    const layer = host.layer('code');
    const tokens = new Map<string, Token>();
    let charW = 12;
    let measured = false;
    let cvs: CodeView[] = [];
    let last: Parameters<NonNullable<ServiceInstance['step']>>[0] | undefined;
    const move = host.timing.move;
    const moveDelay = 0.04;
    const fadeInDelay = 0.12;

    const measureChar = () => {
      const probe = document.createElement('span');
      probe.className = 'tok probe';
      probe.style.cssText = `position:absolute;visibility:hidden;font-size:${REF_FONT}px;white-space:pre`;
      probe.textContent = 'M'.repeat(1000);
      layer.append(probe);
      // offsetWidth (not getBoundingClientRect): independent of a parent's transform: scale() (thumbnails)
      charW = probe.offsetWidth / 1000 || REF_FONT * 0.6;
      probe.remove();
      measured = true;
    };

    const setTransform = (el: HTMLElement, x: number, y: number, s: number) => { el.style.transform = `translate(${x}px, ${y}px) scale(${s})`; };

    /** "2-4,7" (1-based lines) -> set of 0-based rows; undefined = no focus */
    const focusRows = (spec: string | undefined): Set<number> | undefined => {
      if (!spec) return undefined;
      const rows = new Set<number>();
      for (const part of spec.split(',')) {
        const [a, b = a] = part.trim().split('-').map((n) => parseInt(n, 10));
        if (Number.isFinite(a) && Number.isFinite(b)) for (let r = a; r <= b; r++) rows.add(r - 1);
      }
      return rows.size ? rows : undefined;
    };

    /** how long a fading token must stay in the DOM: the stage's own durations (slides may override them) */
    const dyingFor = () => {
      const secs = (name: string, fallback: number) => {
        const v = getComputedStyle(host.stage).getPropertyValue(name).trim();
        const n = parseFloat(v);
        return Number.isFinite(n) ? (v.endsWith('ms') ? n / 1000 : n) : fallback;
      };
      return (Math.max(secs('--move-dur', 0.45), secs('--fade-dur', 0.3)) + 0.25) * 1000;
    };

    /** the translation (CSS px) applied to `el` by itself and its ancestors up to the stage (entrance animations) */
    const translation = (el: HTMLElement) => {
      let dx = 0;
      let dy = 0;
      for (let e: HTMLElement | null = el; e && e !== host.stage; e = e.parentElement) {
        const t = getComputedStyle(e).transform;
        if (!t || t === 'none') continue;
        const m = new DOMMatrixReadOnly(t);
        dx += m.m41;
        dy += m.m42;
      }
      return { dx, dy };
    };

    /**
     * Size every code block of the slide: the font scale fits the widest state into the column (never above MAX_SCALE), then, if a
     * column's content is taller than the column, all blocks in it shrink to fit (never below MIN_SCALE). The block's box gets the
     * exact height of its tallest state, so the text around it never moves between states.
     */
    const layoutBlocks = () => {
      const lineH = REF_FONT * LINE_RATIO;
      const apply = (v: CodeView, s: number) => {
        v.scale = s;
        const gutter = v.cfg.lines ? (String(v.cfg.start + v.rows - 1).length + 1.5) * charW * s : 0;
        v.box.style.height = `${v.rows * lineH * s}px`;
        v.box.style.paddingLeft = `${gutter}px`;
      };
      const opts = (v: CodeView) => props(v.view.element).opts;
      // the states of one block share a scale: the first of each group stands for all
      const groups = new Map<string, CodeView[]>();
      for (const v of cvs) (groups.get(v.view.element.key ?? '') ?? groups.set(v.view.element.key ?? '', []).get(v.view.element.key ?? '')!).push(v);
      const reps = [...groups.values()].map((g) => g[0]);
      const sized = (v: CodeView) => parseFloat(opts(v).size ?? '') > 0;
      for (const v of reps) {
        const size = parseFloat(opts(v).size ?? '');
        const fit = opts(v).fit !== 'none';
        const cs = getComputedStyle(v.wrap);
        const W = v.wrap.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
        const g = v.cfg.lines ? String(v.cfg.start + v.rows - 1).length + 1.5 : 0;
        v.scale = size > 0 ? size / REF_FONT : !fit ? 1 : Math.max(MIN_SCALE, Math.min(MAX_SCALE, W / ((v.cols + g) * charW) || 1));
      }
      // blocks in cells next to each other share one font size (the smallest that fits), so they can be compared
      const sideBySide = reps.filter((v) => v.cells > 1 && !sized(v) && opts(v).fit !== 'none');
      if (sideBySide.length > 1) {
        const smallest = Math.min(...sideBySide.map((v) => v.scale));
        for (const v of sideBySide) v.scale = smallest;
      }
      // a grid taller than the stage: shrink the (fittable) blocks
      const grid = host.stage.querySelector<HTMLElement>(':scope > .grid');
      const mine = reps.filter((v) => !sized(v) && opts(v).fit !== 'none');
      for (const v of reps) apply(v, v.scale);
      if (grid) {
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
      for (const [, g] of groups) for (const v of g.slice(1)) apply(v, g[0].scale);
    };

    const advance = (c: NonNullable<typeof last>, instant: boolean, enterDx = 0, exitDx = 0) => {
      layoutBlocks(); // the geometry may have changed (resize, a late image, a font)
      const dying = dyingFor();
      if (instant) layer.classList.add('no-anim'); // a cut: no transitions at all
      const sr = host.stage.getBoundingClientRect();
      const k = sr.width / (host.stage.offsetWidth || 1) || 1; // a scaled parent (thumbnails)
      const lineH = REF_FONT * LINE_RATIO;
      const seen = new Set<string>();

      const put = (key: string, text: string, cls: string, x: number, y: number, scale: number, opacity: string) => {
        seen.add(key);
        let tk = tokens.get(key);
        if (tk) {
          clearTimeout(tk.timer);
          tk.dying = false;
          tk.el.className = cls;
          tk.el.textContent = text;
          tk.el.style.transition = '';
          tk.el.style.setProperty('--d', instant ? '0s' : `${moveDelay}s`);
          setTransform(tk.el, x, y, scale);
          tk.el.style.opacity = opacity;
          tk.pos = { x, y, s: scale };
        } else {
          const el = document.createElement('span');
          el.className = cls;
          el.textContent = text;
          el.style.opacity = '0';
          el.style.transition = 'none';
          setTransform(el, x + enterDx, y, scale); // a sliding slide starts a bit to the side
          layer.append(el);
          tk = { el, dying: false, pos: { x, y, s: scale } };
          tokens.set(key, tk);
          void el.offsetWidth;
          el.style.transition = '';
          el.style.setProperty('--d', instant ? '0s' : `${enterDx ? SYNC_DELAY : fadeInDelay}s`);
          if (enterDx) setTransform(el, x, y, scale);
          el.style.opacity = opacity;
        }
      };

      for (const base of blocksOf.get(c.step) ?? []) {
        // a block that plays by itself shows the state whose turn it is
        const st = base.cycle ? base.cycle.find((s) => cvs.some((v) => v.view.element === s.element && host.visible(v.view))) ?? base : base;
        const v = cvs.find((x) => x.view.element === st.element);
        if (!v) continue;
        const s = v.scale;
        const br = v.box.getBoundingClientRect();
        const cs = getComputedStyle(v.box);
        const padL = parseFloat(cs.paddingLeft) || 0;
        // the box sits in an item that may be mid-entrance (translated): measure where it will rest, not where it is now
        const sh = translation(v.box);
        const x0 = (br.left - sr.left) / k - sh.dx;
        const y0 = (br.top - sr.top) / k - sh.dy;
        const innerW = v.box.clientWidth - padL;
        const boxH = v.box.clientHeight;
        // the block's own alignment (`align=` `valign=`) wins over the slide's
        const p = props(st.element);
        const fa = fenceAlign(p.classes, p.opts);
        const hAlign = fa.h ?? v.cellH ?? (host.stage.dataset.h as Align | undefined) ?? 'start';
        const vAlign = fa.v ?? v.cellV ?? 'start';
        const rows = st.layout.reduce((m, q) => Math.max(m, q.row + 1), 1);
        const xs = x0 + padL + place(hAlign, innerW, st.cols * charW * s);
        const ys = y0 + place(vAlign, boxH, rows * lineH * s);
        const focus = focusRows(st.focus);
        if (v.cfg.lines) {
          const digits = String(v.cfg.start + v.rows - 1).length;
          for (let r = 0; r < rows; r++) {
            const num = String(v.cfg.start + r);
            put(`${st.groupKey}|ln${r}`, num, 'tok tok-ln', x0 + (digits - num.length) * charW * s, ys + r * lineH * s, s, !focus || focus.has(r) ? '0.45' : '0.12');
          }
        }
        for (const q of st.layout) {
          put(st.keys.get(q.tree.id)!, q.tree.text, `tok tok-${tokenClass(q.tree.label)}`, xs + q.col * charW * s, ys + q.row * lineH * s, s, !focus || focus.has(q.row) ? '1' : '0.25');
        }
      }

      for (const [key, tk] of tokens) {
        if (seen.has(key) || tk.dying) continue;
        tk.dying = true;
        tk.el.classList.add('dying'); // fades out faster than new code fades in: old and new code hardly overlap
        tk.el.style.setProperty('--d', '0s');
        tk.el.style.opacity = '0';
        if (exitDx && tk.pos && !instant) {
          // leaving with a sliding slide: drift out to the side while fading
          tk.el.style.transition = `opacity ${LEAVE_S}s ease-out, transform ${LEAVE_S}s ease-out`; // as fast as the text leaves
          setTransform(tk.el, tk.pos.x + exitDx, tk.pos.y, tk.pos.s);
        }
        tk.timer = window.setTimeout(() => {
          tk.el.remove();
          if (tokens.get(key) === tk) tokens.delete(key);
        }, instant ? 0 : dying);
      }
      if (instant) {
        void layer.offsetWidth; // apply the styles without transitions before re-enabling them
        layer.classList.remove('no-anim');
      }
    };
    void move;

    return {
      slide({ views }) {
        if (!measured) measureChar();
        cvs = views
          .filter((v) => v.element.kind === 'code' && v.data?.box)
          .map((v) => {
            const d = v.data as { wrap: HTMLElement; box: HTMLElement; cfg: BlockCfg; cells: number; cellH?: Align; cellV?: Align };
            const st = states.get(v.element);
            return { view: v, wrap: d.wrap, box: d.box, cfg: d.cfg, cells: d.cells, cellH: d.cellH, cellV: d.cellV, scale: 1, cols: st?.cols ?? 1, rows: st?.rows ?? 1 };
          });
      },
      step(c) {
        last = c;
        // a hard cut asks for no transitions at all; a sliding slide takes the tokens along
        const cut = c.enter === 'none' || (!c.slideChanged && (blocksOf.get(c.step) ?? []).some((b) => b.transition === 'none' && c.entering.some((v) => v.element === b.element)));
        const enterDir = c.slideChanged && !c.instant ? slideDir(c.enter) : 0;
        const exitDir = c.slideChanged && !c.instant ? slideDir(c.exit) : 0;
        advance(c, c.instant || cut, -enterDir * SLIDE_PX, exitDir * SLIDE_PX);
      },
      layout() {
        if (last) advance(last, true);
      },
      destroy() {
        for (const tk of tokens.values()) clearTimeout(tk.timer);
        tokens.clear();
        layer.remove();
      },
    };
  },
};

export const runtime: PluginRuntime = {
  render: {
    code(ctx) {
      const p = props(ctx.element);
      if (!p.animated) {
        // a language without a grammar: a plain block
        ctx.el.classList.add('item-code');
        const pre = document.createElement('pre');
        pre.textContent = p.text;
        ctx.el.append(pre);
        return;
      }
      ctx.el.classList.add('item-block');
      const cfg = blockCfg(p, ctx.meta.code);
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
      ctx.el.append(wrap);
      ctx.register({ owned: true, data: { wrap, box, cfg, cells: ctx.cells, cellH: ctx.h, cellV: ctx.v } });
    },
  },
  service,
};

/** the states of the code blocks on a step (for tests and tools) */
export const codeStatesAt = (step: Step) => (blocksOf.get(step) ?? []).map((s) => ({ element: s.element, groupKey: s.groupKey, keys: s.keys, transition: s.transition, cycle: s.cycle }));
