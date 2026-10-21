// The built-in layouts and the choice among them. A slide's content is a list of parts (one per node); a layout turns the parts
// (and the `left`/`right` slots) into the tree of rows and columns the viewer draws. Without `layout=` the layout follows from
// what is on the slide. An own layout (`layout "name" { row { col { slot "side" } } }`) is built the same way from its nodes.
import type { Layout } from './deck.ts';
import type { KNode } from './kdl.ts';
import { LAYOUTS } from './schema.ts';

export type PartKind = 'title' | 'heading' | 'text' | 'list' | 'quote' | 'table' | 'math' | 'image' | 'video' | 'audio' | 'code' | 'chart' | 'diagram' | 'custom' | 'layout';

export interface Part {
  kind: PartKind;
  layout: Layout;
}

const col = (children: Layout[], opts: Record<string, string> = {}): Layout => ({ kind: 'col', opts, children });
const row = (children: Layout[], opts: Record<string, string> = {}): Layout => ({ kind: 'row', opts, children });
const of = (parts: Part[]) => parts.map((p) => p.layout);
const MEDIA: PartKind[] = ['image', 'video'];
const isHead = (p: Part) => p.kind === 'title' || p.kind === 'heading';

/** which layout a slide with this content gets when it names none */
export function inferLayout(parts: Part[], first: boolean): string {
  if (!parts.length) return 'default';
  if (parts.some((p) => p.kind === 'layout')) return 'default'; // the author laid it out
  const kinds = parts.map((p) => p.kind);
  const has = (...k: PartKind[]) => kinds.some((x) => k.includes(x));
  const only = (...k: PartKind[]) => kinds.every((x) => k.includes(x));
  const media = parts.filter((p) => MEDIA.includes(p.kind));
  if (only('title', 'text', 'heading') && has('title')) {
    if (first) return 'cover';
    if (kinds.length === 1) return 'section';
    return 'default';
  }
  if (only('quote')) return 'quote';
  if (only('image', 'video')) return media.length === 1 ? 'full' : 'gallery';
  if (has('code')) return has('text', 'list') ? 'code-side' : 'code';
  if (media.length === 1 && !has('code', 'table', 'chart', 'diagram', 'audio') && has('text', 'list')) return 'image-right';
  if (media.length >= 2 && only('title', 'heading', 'image', 'video')) return 'gallery';
  return 'default';
}

/** the alignment a layout starts from (the slide's own halign / valign win) */
const DEFAULTS: Record<string, Record<string, string>> = {
  cover: { halign: 'center', valign: 'center' },
  section: { valign: 'center' },
  center: { halign: 'center', valign: 'center' },
  quote: { halign: 'center', valign: 'center' },
  full: { halign: 'center', valign: 'center' },
  'two-cols': { valign: 'center' },
  'three-cols': { valign: 'center' },
  'image-left': { valign: 'center' },
  'image-right': { valign: 'center' },
  gallery: { halign: 'center', valign: 'center' },
  'code-side': { valign: 'center' },
};
export const layoutDefaults = (name: string) => DEFAULTS[name] ?? {};

/** `columns="1 2"` -> the weights of the columns */
const weights = (columns: string | undefined, n: number) => {
  const w = (columns ?? '').split(/\s+/).filter(Boolean);
  return Array.from({ length: n }, (_, i) => ({ size: w[i] ?? '' })).map((o) => (o.size ? o : {}));
};

export function buildLayout(name: string, main: Part[], slots: Record<string, Part[]>, columns?: string): Layout {
  const heads: Part[] = [];
  let i = 0;
  while (i < main.length && isHead(main[i])) heads.push(main[i++]);
  const rest = main.slice(i);
  const cols = (parts: Part[][], w = weights(columns, parts.length)) => row(parts.map((p, k) => col(of(p), w[k])));
  switch (name) {
    case 'two-cols':
      return col([...of(heads), cols([[...rest, ...(slots.left ?? [])], slots.right ?? []])]);
    case 'three-cols':
      return col([...of(heads), cols([[...rest, ...(slots.left ?? [])], slots.middle ?? [], slots.right ?? []])]);
    case 'image-left':
    case 'image-right': {
      const media = main.filter((p) => MEDIA.includes(p.kind));
      const other = main.filter((p) => !MEDIA.includes(p.kind));
      const w = weights(columns, 2);
      const text = col(of(other), w[name === 'image-left' ? 1 : 0]);
      const pic = col(of(media), w[name === 'image-left' ? 0 : 1]);
      return col([row(name === 'image-left' ? [pic, text] : [text, pic])]);
    }
    case 'gallery': {
      const media = rest.filter((p) => MEDIA.includes(p.kind));
      const other = rest.filter((p) => !MEDIA.includes(p.kind));
      const per = media.length <= 3 ? media.length : media.length === 4 ? 2 : 3;
      const rows: Layout[] = [];
      for (let k = 0; k < media.length; k += per) rows.push(row(media.slice(k, k + per).map((p) => col([p.layout]))));
      return col([...of(heads), ...of(other), ...rows]);
    }
    case 'code-side': {
      const code = main.filter((p) => p.kind === 'code');
      const other = main.filter((p) => p.kind !== 'code');
      const w = weights(columns, 2);
      return col([row([col(of(other), w[0]), col(of(code), w[1])])]);
    }
    default:
      return col([...of(main), ...Object.values(slots).flatMap(of)]);
  }
}

/** the slot names of a layout, built in or own */
export function slotsOf(name: string, own: Record<string, KNode>): string[] | undefined {
  if (own[name]) return slotNames(own[name]);
  return LAYOUTS[name]?.slots;
}

const slotNames = (n: KNode): string[] => n.children.flatMap((c) => (c.name === 'slot' && c.args[0] !== undefined ? [String(c.args[0])] : slotNames(c)));

/** an own layout: its rows and columns, with the slots filled */
export function buildOwn(def: KNode, main: Part[], slots: Record<string, Part[]>): Layout {
  const conv = (n: KNode): Layout[] => {
    if (n.name === 'slot') return of(n.args[0] === undefined ? main : slots[String(n.args[0])] ?? []);
    if (n.name !== 'row' && n.name !== 'col' && n.name !== 'grid') return [];
    const opts: Record<string, string> = {};
    for (const k of ['size', 'gap', 'class']) if (n.props[k] !== undefined) opts[k] = String(n.props[k]);
    if (n.props.align !== undefined) opts.halign = String(n.props.align);
    if (n.props.valign !== undefined) opts.valign = String(n.props.valign);
    const kids = n.children.flatMap(conv);
    if (n.name === 'grid') {
      const per = Number(n.props.columns) || 2;
      const rows: Layout[] = [];
      for (let k = 0; k < kids.length; k += per) rows.push(row(kids.slice(k, k + per).map((c) => (c.kind === 'item' ? col([c]) : c)), opts));
      return [col(rows, opts)];
    }
    return [n.name === 'row' ? row(kids.map((c) => (c.kind === 'item' ? col([c]) : c)), opts) : col(kids, opts)];
  };
  return col(def.children.flatMap(conv));
}
