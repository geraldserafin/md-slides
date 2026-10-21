// The built-in layouts, which a slide names with `layout=`. A layout gets the parts of a slide (its elements, in reading order) and
// the contents of its slots, and returns the root column.
import type { Element, LayoutDef } from '../../kernel/types.ts';

const el = (kind: 'row' | 'col', children: Element[], props: Record<string, unknown> = {}): Element => ({ kind, props, at: 0, children });
const col = (children: Element[], props: Record<string, unknown> = {}) => el('col', children, props);
const row = (children: Element[], props: Record<string, unknown> = {}) => el('row', children, props);

const leavesOf = (e: Element): Element[] => (e.children ? e.children.flatMap(leavesOf) : [e]);

/**
 * What a part counts as for the layouts: a static block of code is text, and a `swap` of nothing but code (the states of one block)
 * is code. Any other `swap` is the author's own layout.
 */
const role = (e: Element) => {
  if (e.kind === 'code') return e.props.animated !== true ? 'text' : 'code';
  if (e.kind === 'stack' && leavesOf(e).every((x) => x.kind === 'code' && x.props.animated === true)) return 'code';
  return e.kind;
};
const isMedia = (e: Element) => e.kind === 'image' || e.kind === 'video';
export const HEADS = ['title', 'heading'];
const isHead = (e: Element) => HEADS.includes(e.kind);

/** `columns="1 2"` -> the sizes of the columns */
const weights = (columns: string | undefined, n: number): Record<string, unknown>[] => {
  const w = (columns ?? '').split(/\s+/).filter(Boolean);
  return Array.from({ length: n }, (_, i) => (w[i] ? { size: w[i] } : {}));
};

const split = (parts: Element[]) => {
  const heads: Element[] = [];
  let i = 0;
  while (i < parts.length && isHead(parts[i])) heads.push(parts[i++]);
  return { heads, rest: parts.slice(i) };
};

const plain = (doc: string, defaults?: Record<string, string>): LayoutDef => ({
  doc, defaults,
  build: (parts, slots) => col([...parts, ...Object.values(slots).flat()]),
});

export const builtinLayouts: Record<string, LayoutDef> = {
  default: plain('A title and what follows, one column.'),
  cover: plain('A title slide: big heading, centered, no header or footer.', { halign: 'center', valign: 'center' }),
  section: plain('A divider: a big heading alone.', { valign: 'center' }),
  center: plain('Everything centered on the slide.', { halign: 'center', valign: 'center' }),
  quote: plain('A quote in the middle.', { halign: 'center', valign: 'center' }),
  full: plain('One image or video filling the slide.', { halign: 'center', valign: 'center' }),
  code: plain('A title and code.'),
  'two-cols': {
    doc: 'The title, then two columns.', slots: ['left', 'right'], defaults: { valign: 'center' },
    build(parts, slots, ctx) {
      const { heads, rest } = split(parts);
      const w = weights(ctx.columns, 2);
      return col([...heads, row([col([...rest, ...(slots.left ?? [])], w[0]), col(slots.right ?? [], w[1])])]);
    },
  },
  'three-cols': {
    doc: 'The title, then three columns.', slots: ['left', 'middle', 'right'], defaults: { valign: 'center' },
    build(parts, slots, ctx) {
      const { heads, rest } = split(parts);
      const w = weights(ctx.columns, 3);
      return col([...heads, row([col([...rest, ...(slots.left ?? [])], w[0]), col(slots.middle ?? [], w[1]), col(slots.right ?? [], w[2])])]);
    },
  },
  'image-left': {
    doc: 'The text on the right, the image on the left.', defaults: { valign: 'center' },
    build(parts, _slots, ctx) {
      const w = weights(ctx.columns, 2);
      return col([row([col(parts.filter(isMedia), w[0]), col(parts.filter((p) => !isMedia(p)), w[1])])]);
    },
  },
  'image-right': {
    doc: 'The text on the left, the image on the right.', defaults: { valign: 'center' },
    build(parts, _slots, ctx) {
      const w = weights(ctx.columns, 2);
      return col([row([col(parts.filter((p) => !isMedia(p)), w[0]), col(parts.filter(isMedia), w[1])])]);
    },
  },
  gallery: {
    doc: 'The images in a grid.', defaults: { halign: 'center', valign: 'center' },
    build(parts) {
      const { heads, rest } = split(parts);
      const media = rest.filter(isMedia);
      const other = rest.filter((p) => !isMedia(p));
      const per = media.length <= 3 ? media.length : media.length === 4 ? 2 : 3;
      const rows: Element[] = [];
      for (let k = 0; k < media.length; k += per) rows.push(row(media.slice(k, k + per).map((p) => col([p]))));
      return col([...heads, ...other, ...rows]);
    },
  },
  'code-side': {
    doc: 'Text on one side, code on the other.', defaults: { valign: 'center' },
    build(parts, _slots, ctx) {
      const w = weights(ctx.columns, 2);
      return col([row([col(parts.filter((p) => role(p) !== 'code'), w[0]), col(parts.filter((p) => role(p) === 'code'), w[1])])]);
    },
  },
};

