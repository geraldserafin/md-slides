// Text: headings, paragraphs, lists, quotes, tables, math and the notes. The text keeps its inline markup (`**bold**`…) as
// written; the renderer turns it into HTML.
import { plainText } from './inline.ts';
import { str, textArg } from '../../kernel/util.ts';
import type { Element, KNode, LowerCtx, NodeDef, Plugin, PropDef } from '../../kernel/types.ts';

const SIZE: Record<string, PropDef> = { size: { doc: 'size relative to the theme', values: ['small', 'large'] } };
const ALIGN: Record<string, PropDef> = {
  align: { doc: 'horizontal alignment inside its part', values: ['left', 'center', 'right'] },
  valign: { doc: 'vertical alignment inside its part', values: ['top', 'middle', 'bottom'] },
};
const FX: Record<string, PropDef> = {
  anim: { doc: 'how it comes in', valuesFrom: 'effects' },
  id: { doc: 'morph id: the same id on the next slide glides between the two (for `code`: the animation)' },
};

const INLINE = 'the text; inline: **bold** *italic* ~~strike~~ ==mark== ~sub~ ^sup^ `code` [link](url) $tex$ [[Key]]';

/** the properties of a text element: its size and alignment */
const own = (n: KNode, extra: Record<string, unknown> = {}) => {
  const p: Record<string, unknown> = { ...extra };
  for (const k of ['size', 'align', 'valign']) if (n.props[k] !== undefined) p[k] = String(n.props[k]);
  return p;
};

const textNode = (kind: string, doc: string, extra: Record<string, PropDef> = {}, heading = false): NodeDef => ({
  doc, part: true,
  args: [{ name: 'text', doc: INLINE }],
  props: { ...SIZE, ...ALIGN, ...FX, ...extra },
  lower(n, ctx) {
    const text = textArg(n, ctx);
    if (heading) ctx.heading(plainText(text));
    return ctx.element(kind, n, own(n, { text, ...(kind === 'quote' && n.props.by !== undefined ? { by: String(n.props.by) } : {}) }));
  },
});

export interface ListItem {
  text: string;
  children: ListSpec[];
}
export interface ListSpec {
  numbered: boolean;
  start?: number;
  items: ListItem[];
}

function listSpec(n: KNode, ctx: LowerCtx): ListSpec {
  return {
    numbered: n.args.includes('numbered'),
    ...(n.props.start !== undefined ? { start: Number(n.props.start) } : {}),
    items: n.children.filter((c) => c.name === '-').map((li) => ({
      text: li.args.length ? String(li.args[0]) : '',
      children: li.children.filter((c) => c.name === 'list').map((c) => listSpec(c, ctx)),
    })),
  };
}

export const coreText: Plugin = {
  name: 'core-text',
  api: 1,
  nodes: {
    title: textNode('title', 'The big heading of the slide (also its name in the drawer).', {}, true),
    heading: textNode('heading', 'A heading.', {}, true),
    subheading: textNode('subheading', 'A smaller heading.'),
    text: textNode('text', 'A paragraph.'),
    quote: textNode('quote', 'A quote with an accent bar.', { by: { doc: 'who said it' } }),
    list: {
      doc: 'A list of `-` items; may be nested.', part: true,
      props: { start: { doc: 'the first number (numbered)', type: 'number' }, ...SIZE, ...ALIGN, ...FX },
      flags: { numbered: 'a numbered list', steps: 'one item per click' },
      children: ['-'],
      lower(n, ctx) {
        const spec = listSpec(n, ctx);
        if (!n.args.includes('steps')) return ctx.element('list', n, own(n, { ...spec }));
        // one element per item, each on the next click; the numbering goes on
        return ctx.scope(() => {
          const base = ctx.stage;
          const start = spec.numbered ? spec.start ?? 1 : 1;
          return spec.items.map((item, i) => {
            ctx.stage = base + 1 + i;
            return ctx.element('list', n, own(n, { numbered: spec.numbered, start: start + i, items: [item] }));
          });
        });
      },
    },
    '-': {
      doc: 'An item of a list (a text, and a nested `list`), or a row of a table (its cells).',
      args: [{ name: 'text', doc: 'the text of the item, or a cell' }], rest: true, children: ['list'],
    },
    table: {
      doc: 'A table: a `head` line and `-` lines.', part: true, props: { ...SIZE, ...ALIGN, ...FX }, children: ['head', '-'],
      lower(n, ctx) {
        const cells = (c: KNode) => c.args.map((a) => String(a));
        const head = n.children.find((c) => c.name === 'head');
        return ctx.element('table', n, own(n, { head: head ? cells(head) : undefined, rows: n.children.filter((c) => c.name === '-').map(cells) }));
      },
    },
    head: { doc: 'The header cells of a table.', args: [{ name: 'cell', doc: 'a cell' }], rest: true },
    math: {
      doc: 'Display math (KaTeX).', part: true, args: [{ name: 'tex', doc: 'the formula' }], props: { ...ALIGN, ...FX },
      lower: (n, ctx) => ctx.element('math', n, own(n, { tex: textArg(n, ctx, 'a formula') })),
    },
    notes: {
      doc: 'Presenter notes (press p).', part: true, args: [{ name: 'text', doc: 'the notes' }],
      lower(n, ctx) {
        ctx.notes.push(textArg(n, ctx));
      },
    },
  },
  runtime: () => import('./runtime.ts').then((m) => m.runtime),
};

void str;
export type { Element };
