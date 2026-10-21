// .slides -> presentation model. A .slides file is KDL (see kdl.ts, schema.ts): a `deck` node with the settings, `layout` nodes
// (own layouts) and `slide` nodes. A slide is one section: a tree of rows and columns (chosen by its layout, see layouts.ts)
// whose leaves are text (`title`, `text`, `list`...), animated code blocks, images, charts... in reading order. `pause` and `step`
// make what follows appear on the next click. A `code` is one animated block, its `frame`s are the states it passes through;
// blocks with the same `id` are one animation across slides. A `swap` shows one of its children at a time (a click swaps them).
import katex from 'katex';
import { renderChart } from './chart';
import { deckFromNode } from './deckmeta';
import { fetchFile, fetchJson, fileUrl } from './files';
import type { ChromeBar } from './chrome';
import { renderInline } from './inline';
import { KdlError, parseKdl, type KNode, type KValue } from './kdl';
import { buildLayout, buildOwn, inferLayout, layoutDefaults, slotsOf, type Part, type PartKind } from './layouts';
import { loadPlugins, pluginThemes } from './plugins';
import { langFromTag, type Lang } from './parse';
import { LAYOUTS, NODES } from './schema';

export type Item = (
  | { kind: 'html'; html: string; tag: string } // heading/paragraph/list/quote...
  | { kind: 'image'; src: string; alt: string; attrs: Attrs }
  | { kind: 'video'; src: string; attrs: Attrs }
  | { kind: 'audio'; src: string; attrs: Attrs }
  | { kind: 'diagram'; text: string; attrs: Attrs } // a <diagram>
  | { kind: 'custom'; tag: string; attrs: Record<string, string>; text: string } // a tag of a plugin
  | { kind: 'code'; text: string; lang: string } // static block (language without a grammar)
  | { kind: 'block'; block: number } // an animated code block: index into Section.blocks
) & {
  at: number; // the reveal stage it appears at (0 = from the start)
  /** per-element animation, from the attributes `anim=zoom delay=0.2 dur=0.6 out=3` */
  fx?: Record<string, string>;
};

/** an item before it is given its reveal stage */
type ItemInit = Item extends infer I ? (I extends unknown ? Omit<I, 'at'> : never) : never;

export interface Frame {
  code: string;
  focus?: string; // lines to keep bright, e.g. "2-4,7"
  transition?: string; // how it is entered from the previous frame: morph | fade | none
  at: number; // the reveal stage it appears at
}

/** An animated code block; blocks with the same id are the frames of one animation. */
export interface Block {
  id: string; // explicit (`id=name`, shared across the deck) or generated
  explicit: boolean;
  lang: Lang;
  classes: string[]; // `class=` of the code tag (e.g. "left", "lines", "panel")
  opts: Record<string, string>; // the other attributes (e.g. size=18, start=10, title=cart.ts, autoplay=1, loop)
  frames: Frame[];
  /** `<code from=id />`: a copy of the last frame of the block with that id (filled in when the deck is loaded) */
  from?: string;
}

export interface Attrs {
  classes: string[];
  opts: Record<string, string>;
}

/** the layout of a section: `row` = parts side by side, `col` = parts stacked, `stack` = parts in one place (a `swap`); the leaves are the items */
export type Layout =
  | { kind: 'row' | 'col' | 'stack'; opts: Record<string, string>; children: Layout[] } // opts: size, halign, valign, justify, class; a stack shows its children in one place
  | { kind: 'item'; item: Item };

export interface Section {
  layout: Layout; // a col
  blocks: Block[];
  stages: number; // reveal stages: 1 + the number of clicks that add content
}

const leavesOf = (l: Layout): Item[] => (l.kind === 'item' ? [l.item] : l.children.flatMap(leavesOf));
/** all items of a section, in reading order */
export const sectionItems = (s: Section): Item[] => leavesOf(s.layout);

export interface Slide {
  /** the slide's settings (the \`<slide>\` block: theme, background, class, halign, valign, --css-vars...), merged over the deck defaults */
  meta: Record<string, string>;
  /** the slide's own front matter, before the deck defaults were merged in */
  own: Record<string, string>;
  /** the \`<head>\`: stays while the sections below swap */
  head: Item[];
  sections: Section[];
  notes: string[];
  title: string;
  url: string;
}

export interface AnimationOpts {
  move?: number; // s, move duration
  fade?: number; // s, fade in/out duration
  moveDelay?: number; // s, stagger: moves start after the fade-out
  fadeInDelay?: number; // s, stagger: new tokens
  ease?: string; // CSS timing function
  slideFade?: number; // s, background/text change
  textTransition?: 'fade' | 'slide' | 'slide-right' | 'slide-left' | 'zoom' | 'none'; // section text entrance
  textStagger?: number; // s, delay between consecutive text elements (default 0.06: heading first, then the body)
  sectionTransition?: 'fade' | 'slide' | 'slide-right' | 'slide-left' | 'zoom' | 'none'; // swaps between the ## sections of a slide (default: the slide's own transition)
  textDrift?: number; // px, how far text drifts while it fades (new text rises into place, old text lifts away); 0 = none (default 8)
}

export interface DeckMeta {
  title?: string;
  description?: string;
  hidden?: boolean; // not listed in the gallery
  /** seconds per step: the deck plays itself (a key or click stops it; the `a` key starts it); `?autoplay=5` in the URL does the same */
  autoplay?: number;
  /** start again after the last step when autoplaying */
  loop?: boolean;
  thumbnail?: string; // gallery image instead of the live first slide
  author?: string;
  date?: string;
   /** settings applied to every slide unless the slide sets its own, e.g. {"align": "left"} */
  defaults?: Record<string, string>;
  /** like defaults, but only for slides that show two columns (a row of two parts); e.g. {"valign": "center"} */
  columns?: Record<string, string>;
  /** like defaults, but only for slides without code (a single column of text); e.g. {"halign": "center", "valign": "center"} */
  textOnly?: Record<string, string>;
  header?: ChromeBar;
  footer?: ChromeBar;
  theme?: string;
  /** themes for light and dark mode: the hub's toggle (and the OS) pick between them */
  schemes?: { light?: string; dark?: string };
  css?: string;
  /** deck-wide CSS variables, e.g. {"--accent": "#f00", "--font-text": "Georgia"} */
  vars?: Record<string, string>;
  /** custom themes: name -> CSS variables */
  themes?: Record<string, Record<string, string>>;
  fonts?: { family: string; src: string; weight?: string; style?: string }[];
  googleFonts?: string[];
  animation?: AnimationOpts;
  /** look of animated code blocks; a block's own options win */
  code?: CodeStyle;
  /** plugins (ES modules, relative to the deck folder, or npm package names the CLI stages) */
  plugins?: string[];
  files: string[];
}

export interface CodeStyle {
  bg?: string; // "panel" | "none" | any CSS color
  lines?: boolean; // line numbers
  radius?: number | string; // panel corner radius (px or CSS length)
  pad?: string; // panel padding, CSS
}

export interface Deck {
  name: string;
  meta: DeckMeta;
  slides: Slide[];
}

const tex = (src: string, display: boolean) => katex.renderToString(src, { displayMode: display, throwOnError: false, output: 'html' });

/** `hidden=#true` on a slide: it is left out of the presentation (and the PDF) but stays in the files */
export const isHidden = (s: Slide) => /^(true|yes|on|1)$/i.test(s.meta.hidden ?? '');

const resolve = (src: string, base: string) => {
  try {
    return fileUrl(new URL(src, base).href);
  } catch {
    return src;
  }
};

const FX = ['anim', 'delay', 'dur', 'out', 'morph'];
const strs = (p: Record<string, KValue>, skip: string[] = []) => Object.fromEntries(Object.entries(p).filter(([k]) => !skip.includes(k)).map(([k, v]) => [k, String(v)]));
const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const CODE_FLAGS = new Set(['lines', 'nolines', 'nopanel', 'loop']);

export interface ParsedFile {
  deck: Partial<DeckMeta>;
  /** own layouts by name */
  layouts: Record<string, KNode>;
  slides: KNode[];
}

/** the nodes at the top of a .slides file: `deck`, `layout`, `slide` */
export function parseFile(src: string): ParsedFile {
  const out: ParsedFile = { deck: {}, layouts: {}, slides: [] };
  for (const n of parseKdl(src)) {
    if (n.name === 'deck') Object.assign(out.deck, deckFromNode(n));
    else if (n.name === 'layout') {
      if (n.args[0] === undefined) throw new KdlError('`layout` needs a name: layout "sidebar" { … }', n.line);
      out.layouts[String(n.args[0])] = n;
    } else if (n.name === 'slide') out.slides.push(n);
    else throw new KdlError(`unknown node \`${n.name}\` at the top (expected deck, layout or slide)`, n.line);
  }
  return out;
}

export interface BuildCtx {
  url: string;
  layouts: Record<string, KNode>;
  /** the position of the slide in the deck (the first slide may be a cover) */
  index: number;
}

export function buildSlide(node: KNode, ctx: BuildCtx): Slide {
  const { url } = ctx;
  const notes: string[] = [];
  let title = '';
  /** the state of the slide being built */
  interface State {
    stage: number; // the reveal stage of what is being added
    clicks: number; // the highest stage used so far (the next `step` is clicks + 1)
    blocks: Block[];
    fx: Record<string, string>; // animation properties of the enclosing `step`
  }
  const st: State = { stage: 0, clicks: 0, blocks: [], fx: {} };
  let autoId = 0;

  const fail = (n: KNode, message: string): never => { throw new KdlError(message, n.line, n.col); };
  const textOf = (n: KNode): string => {
    const t = n.args[0];
    if (t === undefined || t === null) return fail(n, `\`${n.name}\` needs a text: ${n.name} "…"`);
    return String(t);
  };
  const inl = (s: string) => renderInline(s, { tex: (t) => tex(t, false), href: (u) => (/^(#|[a-z]+:)/i.test(u) ? u : resolve(u, url)) });

  const leaf = (item: ItemInit, props: Record<string, KValue> = {}, id = true): Layout => {
    const fx: Record<string, string> = { ...st.fx };
    for (const k of FX) if (props[k] !== undefined) fx[k] = String(props[k]);
    if (id && props.id !== undefined && fx.morph === undefined) fx.morph = String(props.id);
    const at = st.stage;
    st.clicks = Math.max(st.clicks, at);
    return { kind: 'item', item: { ...item, at, ...(Object.keys(fx).length ? { fx } : {}) } as Item };
  };
  /** align / valign on a node belong to its part of the layout */
  const placed = (n: KNode, l: Layout[]): Layout => {
    const o: Record<string, string> = {};
    if (n.props.align !== undefined) o.halign = String(n.props.align);
    if (n.props.valign !== undefined) o.valign = String(n.props.valign);
    return Object.keys(o).length ? { kind: 'col', opts: o, children: l } : l.length === 1 ? l[0] : { kind: 'col', opts: {}, children: l };
  };
  const sizeClass = (n: KNode) => (n.props.size === 'small' || n.props.size === 'large' ? ` class="size-${n.props.size}"` : '');

  const listHtml = (n: KNode, only?: KNode, start?: number): string => {
    const ordered = n.args.includes('numbered');
    const tag = ordered ? 'ol' : 'ul';
    const s = start ?? (ordered && n.props.start !== undefined ? Number(n.props.start) : undefined);
    const items = (only ? [only] : n.children.filter((c) => c.name === '-'))
      .map((li) => `<li>${inl(li.args.length ? String(li.args[0]) : '')}${li.children.filter((c) => c.name === 'list').map((c) => listHtml(c)).join('')}</li>`).join('');
    return `<${tag}${s && s !== 1 ? ` start="${s}"` : ''}>${items}</${tag}>`;
  };
  const tableHtml = (n: KNode): string => {
    const cells = (c: KNode, t: string) => c.args.map((a) => `<${t}>${inl(String(a))}</${t}>`).join('');
    const head = n.children.filter((c) => c.name === 'head').map((c) => `<tr>${cells(c, 'th')}</tr>`).join('');
    const body = n.children.filter((c) => c.name === '-').map((c) => `<tr>${cells(c, 'td')}</tr>`).join('');
    return `<table>${head ? `<thead>${head}</thead>` : ''}<tbody>${body}</tbody></table>`;
  };

  const flagsOf = (n: KNode, from: number) => new Set(n.args.slice(from).filter((a) => typeof a === 'string').map(String));
  const mediaOpts = (n: KNode, flags: Set<string>): Attrs => {
    const opts: Record<string, string> = strs(n.props, ['src', 'alt', 'id', 'anim', 'align', 'valign']);
    for (const f of flags) opts[f === 'nocontrols' ? 'controls' : f] = f === 'nocontrols' ? 'false' : 'true';
    return { classes: [], opts };
  };

  /** the code of a `code` node: its first argument after the language that is not a flag */
  const codeOf = (n: KNode) => n.args.slice(typeof n.args[0] === 'string' && !CODE_FLAGS.has(n.args[0]) ? 1 : 0).find((x) => typeof x === 'string' && !CODE_FLAGS.has(x));

  /**
   * One animated block from one `code` node, or from the `code` children of a `swap` (its states: the first is there with the block,
   * each next one takes a click and the diff between two is what moves). The options of the block are the first node's, the
   * `autoplay` and `loop` of the swap come on top; `focus` and `transition` are the node's own.
   */
  const codeLeaf = (nodes: KNode[], swap?: KNode): Layout => {
    const n = nodes[0];
    const a: Record<string, KValue> = { ...(swap?.props.autoplay !== undefined ? { autoplay: swap.props.autoplay } : {}), ...n.props };
    const lang0 = typeof n.args[0] === 'string' && !CODE_FLAGS.has(n.args[0]) ? n.args[0] : undefined;
    const rest = n.args.slice(lang0 === undefined ? 0 : 1);
    const flags = new Set([...rest.filter((x) => typeof x === 'string' && CODE_FLAGS.has(x)).map(String), ...(swap?.args.includes('loop') ? ['loop'] : [])]);
    const from = a.from === undefined ? undefined : String(a.from);
    if (from !== undefined && nodes.length > 1) fail(n, '`code from=…` is one state: it cannot be in a swap with other code');
    const srcs = nodes.map((c) => {
      const code = codeOf(c);
      if (code === undefined && from === undefined) fail(c, '`code` has no code: write it as the second argument: code "ts" "let a = 1;"');
      if (nodes.length > 1 && c.args[0] !== n.args[0]) fail(c, `all the code of a swap is in one language (${String(n.args[0])}, not ${String(c.args[0])})`);
      return { code: String(code ?? ''), focus: c.props.focus, transition: c.props.transition };
    });
    const lang = from === undefined && lang0 ? langFromTag(lang0) : undefined;
    if (from === undefined && !lang) return leaf({ kind: 'code', text: srcs[0].code, lang: lang0 ?? '' }, a, false);
    const classes = [...flags].filter((f) => f !== 'loop');
    const opts: Record<string, string> = strs(a, ['id', 'from', 'focus', 'transition', 'anim', 'align', 'valign']);
    if (a.align !== undefined) opts.halign = String(a.align);
    if (a.valign !== undefined) opts.valign = String(a.valign);
    if (flags.has('loop')) opts.loop = 'true';
    const at = st.stage;
    const block: Block = {
      id: a.id !== undefined ? String(a.id) : `b${autoId++}`, explicit: a.id !== undefined, lang: lang ?? '', classes, opts,
      frames: from !== undefined ? [] : srcs.map((f, i) => {
        // an autoplay block plays its frames by itself: they take no clicks
        const fat = i === 0 || a.autoplay !== undefined ? at : ++st.clicks;
        st.clicks = Math.max(st.clicks, fat);
        return { code: f.code, focus: f.focus !== undefined ? String(f.focus) : undefined, transition: f.transition as string | undefined, at: fat };
      }),
    };
    if (from !== undefined) block.from = from;
    st.clicks = Math.max(st.clicks, at);
    st.blocks.push(block);
    return leaf({ kind: 'block', block: st.blocks.length - 1 }, { ...a, id: undefined as never }, false);
  };

  const part = (kind: PartKind, layout: Layout): Part => ({ kind, layout });
  const textPart = (n: KNode, kind: PartKind, tag: string, html: string): Part =>
    part(kind, placed(n, [leaf({ kind: 'html', html, tag }, n.props)]));

  /** the nodes of a container as parts; a `pause` holds back everything after it inside the container */
  const walk = (children: KNode[]): Part[] => {
    const out: Part[] = [];
    const base = st.stage;
    for (const n of children) {
      switch (n.name) {
        case 'title': case 'heading': case 'subheading': {
          const level = n.name === 'title' ? 'h1' : n.name === 'heading' ? 'h2' : 'h3';
          if (!title && n.name !== 'subheading') title = plain(inl(textOf(n)));
          out.push(textPart(n, n.name === 'title' ? 'title' : 'heading', level, `<${level}${sizeClass(n)}>${inl(textOf(n))}</${level}>`));
          break;
        }
        case 'text': out.push(textPart(n, 'text', 'paragraph', `<p${sizeClass(n)}>${inl(textOf(n))}</p>`)); break;
        case 'quote': out.push(textPart(n, 'quote', 'blockquote', `<blockquote${sizeClass(n)}>${inl(textOf(n))}${n.props.by !== undefined ? `<footer>${inl(String(n.props.by))}</footer>` : ''}</blockquote>`)); break;
        case 'table': out.push(textPart(n, 'table', 'table', tableHtml(n))); break;
        case 'math': out.push(part('math', placed(n, [leaf({ kind: 'html', html: `<div class="math-block">${tex(textOf(n), true)}</div>`, tag: 'math' }, n.props)]))); break;
        case 'list': {
          const items = n.children.filter((c) => c.name === '-');
          if (n.args.includes('steps')) {
            // item by item, one click each
            const b = st.stage;
            const start = n.args.includes('numbered') ? Number(n.props.start) || 1 : 1;
            const ls = items.map((li, i) => {
              st.stage = b + 1 + i;
              return leaf({ kind: 'html', html: listHtml(n, li, start + i), tag: 'list' }, n.props);
            });
            st.stage = b;
            for (const l of ls) out.push(part('list', l));
          } else out.push(textPart(n, 'list', 'list', listHtml(n)));
          break;
        }
        case 'code': {
          const l = codeLeaf([n]);
          // only an animated block is "code" to the layouts; a static block (no grammar) is text
          out.push(part(l.kind === 'item' && l.item.kind === 'block' ? 'code' : 'text', placed(n, [l])));
          break;
        }
        case 'image': {
          const attrs = mediaOpts(n, flagsOf(n, 1));
          out.push(part('image', placed(n, [leaf({ kind: 'image', src: resolve(textOf(n), url), alt: n.props.alt !== undefined ? String(n.props.alt) : '', attrs }, n.props)])));
          break;
        }
        case 'video': out.push(part('video', placed(n, [leaf({ kind: 'video', src: resolve(textOf(n), url), attrs: mediaOpts(n, flagsOf(n, 1)) }, n.props)]))); break;
        case 'audio': out.push(part('audio', placed(n, [leaf({ kind: 'audio', src: resolve(textOf(n), url), attrs: mediaOpts(n, flagsOf(n, 1)) }, n.props)]))); break;
        case 'chart': {
          const csv = String(n.args[1] ?? '');
          if (!csv) fail(n, '`chart` needs a type and the data: chart "bar" """ … """');
          const opts: Record<string, string> = { type: String(n.args[0]), ...(n.props.title !== undefined ? { title: String(n.props.title) } : {}) };
          out.push(part('chart', placed(n, [leaf({ kind: 'html', html: `<div class="chart-box" style="${n.props.width ? `width:${n.props.width}` : ''}">${renderChart(csv, opts)}</div>`, tag: 'chart' }, n.props)])));
          break;
        }
        case 'diagram': out.push(part('diagram', placed(n, [leaf({ kind: 'diagram', text: textOf(n), attrs: { classes: [], opts: strs(n.props, ['id', 'anim']) } }, n.props)]))); break;
        case 'notes': notes.push(textOf(n)); break;
        case 'pause': st.stage = ++st.clicks; break;
        case 'step': {
          const saved = { stage: st.stage, fx: st.fx };
          const at = st.clicks + 1;
          st.clicks = at;
          st.stage = at;
          st.fx = { ...st.fx, ...(n.props.anim !== undefined ? { anim: String(n.props.anim) } : {}) };
          out.push(...walk(n.children));
          st.stage = saved.stage;
          st.fx = saved.fx;
          break;
        }
        case 'swap': {
          // one child at a time: the next one comes in on the next click, the one before it leaves
          if (n.children.length && n.children.every((c) => c.name === 'code' && c.props.from === undefined)) {
            // only code: the states of one animated block
            if (n.children.length === 1) fail(n, 'a `swap` of one thing: write the thing');
            const l = codeLeaf(n.children, n);
            out.push(part(l.kind === 'item' && l.item.kind === 'block' ? 'code' : 'text', placed(n, [l])));
            break;
          }
          if (n.props.autoplay !== undefined || n.args.includes('loop')) fail(n, '`autoplay` and `loop` of a `swap` work for code only');
          const alts: Layout[] = [];
          const starts: number[] = [];
          const own = (l: Layout): Item[] => (l.kind === 'item' ? [l.item] : l.children.flatMap(own));
          const saved = st.fx;
          if (n.props.anim !== undefined) st.fx = { ...st.fx, anim: String(n.props.anim) };
          n.children.forEach((child, i) => {
            if (i > 0) st.stage = ++st.clicks;
            starts.push(st.stage);
            const parts = walk([child]);
            alts.push(parts.length === 1 ? parts[0].layout : { kind: 'col', opts: {}, children: parts.map((p) => p.layout) });
          });
          st.fx = saved;
          alts.forEach((l, i) => {
            if (i + 1 < alts.length) for (const it of own(l)) it.fx = { ...it.fx, out: String(starts[i + 1]) };
          });
          const o: Record<string, string> = {};
          for (const k of ['size', 'class']) if (n.props[k] !== undefined) o[k] = String(n.props[k]);
          if (n.props.align !== undefined) o.halign = String(n.props.align);
          if (n.props.valign !== undefined) o.valign = String(n.props.valign);
          st.stage = base;
          out.push(part('layout', { kind: 'stack', opts: o, children: alts }));
          break;
        }
        case 'row': case 'col': case 'grid': {
          const kids = walk(n.children);
          const opts: Record<string, string> = {};
          for (const k of ['size', 'gap', 'class']) if (n.props[k] !== undefined) opts[k] = String(n.props[k]);
          if (n.props.align !== undefined) opts.halign = String(n.props.align);
          if (n.props.valign !== undefined) opts.valign = String(n.props.valign);
          if (n.name === 'grid') {
            const per = Number(n.props.columns) || 2;
            const rows: Layout[] = [];
            for (let k = 0; k < kids.length; k += per) rows.push({ kind: 'row', opts: {}, children: kids.slice(k, k + per).map((p) => (p.layout.kind === 'item' ? { kind: 'col' as const, opts: {}, children: [p.layout] } : p.layout)) });
            out.push(part('layout', { kind: 'col', opts, children: rows }));
          } else {
            const cell = (p: Part): Layout => (p.layout.kind === 'item' ? { kind: 'col', opts: {}, children: [p.layout] } : p.layout);
            out.push(part('layout', n.name === 'row' ? { kind: 'row', opts, children: kids.map(cell) } : { kind: 'col', opts, children: kids.map((p) => p.layout) }));
          }
          break;
        }
        default: {
          if (!NODES[n.name]?.plugin) fail(n, `unknown node \`${n.name}\``);
          out.push(part('custom', placed(n, [leaf({ kind: 'custom', tag: n.name, attrs: strs(n.props, ['id', 'anim']), text: n.args[0] === undefined ? '' : String(n.args[0]) }, n.props)])));
        }
      }
    }
    st.stage = base;
    return out;
  };

  // the slide's properties
  const p = node.props;
  const meta: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'align') meta.halign = String(v);
    else if (k === 'columns' || k === 'layout') continue;
    else meta[k] = typeof v === 'boolean' ? String(v) : String(v);
  }
  let name = p.layout !== undefined ? String(p.layout) : undefined;
  const hasSlot = (s: string) => node.children.some((c) => c.name === s);
  if (!name && (hasSlot('left') || hasSlot('right') || hasSlot('middle'))) name = hasSlot('middle') ? 'three-cols' : 'two-cols';
  const slotNames = name ? slotsOf(name, ctx.layouts) : undefined;
  if (name && !slotNames) fail(node, `unknown layout \`${name}\` (built in: ${Object.keys(LAYOUTS).join(', ')}${Object.keys(ctx.layouts).length ? `; own: ${Object.keys(ctx.layouts).join(', ')}` : ''})`);

  const main: Part[] = [];
  const slots: Record<string, Part[]> = {};
  // the main parts and the slots are walked in the order they are written, so reveal stages follow the text
  const mainNodes: KNode[] = [];
  const flushMain = () => { main.push(...walk(mainNodes.splice(0))); };
  for (const c of node.children) {
    if (slotNames?.includes(c.name)) { flushMain(); slots[c.name] = [...(slots[c.name] ?? []), ...walk(c.children)]; }
    else mainNodes.push(c);
  }
  flushMain();

  const layoutName = name ?? inferLayout(main, ctx.index === 0);
  const root = ctx.layouts[layoutName] ? buildOwn(ctx.layouts[layoutName], main, slots) : buildLayout(layoutName, main, slots, p.columns !== undefined ? String(p.columns) : undefined);
  const own: Record<string, string> = { ...layoutDefaults(layoutName), ...meta, layout: layoutName };
  return {
    meta: own, own, head: [], notes, title: own.title || title || '(untitled)', url,
    sections: [{ layout: root, blocks: st.blocks, stages: st.clicks + 1 }],
  };
}

/** all the slides of one source text (tests, tools): the deck settings are in `deck` */
export function parseSlides(src: string, url: string, index = 0): { slides: Slide[]; deck: Partial<DeckMeta> } {
  const f = parseFile(src);
  return { deck: f.deck, slides: f.slides.map((n, i) => buildSlide(n, { url, layouts: f.layouts, index: index + i })) };
}

/** `code from=id`: fill in the copies (the last frame of the nearest earlier block with that id) */
export function resolveRefs(slides: Slide[]) {
  const seen = new Map<string, Block>();
  for (const slide of slides)
    for (const sec of slide.sections)
      for (const b of sec.blocks) {
        if (b.from !== undefined) {
          const src = seen.get(b.from);
          if (!src) throw new Error(`code from="${b.from}": no earlier block with that id (${slide.url})`);
          b.lang = src.lang;
          b.frames = [{ code: src.frames[src.frames.length - 1].code, at: b.frames[0]?.at ?? 0 }];
        } else if (b.explicit) seen.set(b.id, b);
      }
}

export async function loadDeck(name: string, base = 'decks'): Promise<Deck> {
  const root = new URL(`${base}/${name}/`, document.baseURI).href;
  const meta = await fetchJson<DeckMeta>(fileUrl(root + 'manifest.json'), `The deck "${name}"`);
  const files = await Promise.all(
    meta.files.map(async (f) => {
      const url = root + encodeURI(f);
      const text = await (await fetchFile(fileUrl(url), `The file ${f}`)).text();
      try {
        return { url, ...parseFile(text) };
      } catch (e) {
        throw new Error(`${name}/${f}, ${(e as Error).message}`);
      }
    }),
  );
  const layouts = Object.assign({}, ...files.map((f) => f.layouts)) as Record<string, KNode>;
  for (const f of files) {
    const { vars, themes, ...rest } = f.deck;
    Object.assign(meta, rest);
    if (vars) meta.vars = { ...meta.vars, ...vars };
    if (themes) meta.themes = { ...meta.themes, ...themes };
  }
  await loadPlugins((meta.plugins ?? []).map((p) => fileUrl(new URL(p, root).href)));
  if (Object.keys(pluginThemes()).length) meta.themes = { ...pluginThemes(), ...(meta.themes ?? {}) };
  let index = 0;
  const slides = files.flatMap((f) => f.slides.map((n) => {
    try {
      return buildSlide(n, { url: f.url, layouts, index: index++ });
    } catch (e) {
      throw new Error(`${name}/${decodeURI(f.url.slice(root.length))}, ${(e as Error).message}`);
    }
  }));
  for (const s of slides) s.meta = { ...(meta.defaults ?? {}), ...s.own };
  resolveRefs(slides);
  return { name, meta, slides };
}
