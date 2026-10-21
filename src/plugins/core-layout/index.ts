// The slide and its layout: `slide` (and which layout it gets), `layout` (your own), `row`, `col`, `grid`, `slot`. A layout turns
// the parts of a slide into rows and columns; without `layout=` the slide is one column, as written.
import { PluginError } from '../../kernel/registry.ts';
import { layoutProps, str } from '../../kernel/util.ts';
import type { Element, KNode, LayoutDef, LowerCtx, NodeDef, Plugin, PropDef, TopCtx } from '../../kernel/types.ts';
import { builtinLayouts } from './layouts.ts';

const HALIGN = ['left', 'center', 'right'];
const VALIGN = ['top', 'middle', 'bottom'];
const ALIGN: Record<string, PropDef> = {
  align: { doc: 'horizontal alignment inside its part', values: HALIGN },
  valign: { doc: 'vertical alignment inside its part', values: VALIGN },
};
const LAYOUT: Record<string, PropDef> = {
  size: { doc: 'its share of the row/col: a weight (2), `auto`, or a length ("40%")' },
  gap: { doc: 'space between the parts (a number is in vmin, or any CSS length)' },
  ...ALIGN,
  class: { doc: 'extra CSS class' },
};

export const container = (kind: 'row' | 'col') => (n: KNode, ctx: LowerCtx): Element => ctx.element(kind, n, layoutProps(n), ctx.lower(n.children));

/** an own layout: its rows and columns with the slots filled */
function layoutFromNode(def: KNode): LayoutDef {
  const slots: string[] = [];
  const collect = (n: KNode) => { for (const c of n.children) { if (c.name === 'slot' && c.args[0] !== undefined) slots.push(String(c.args[0])); else collect(c); } };
  collect(def);
  return {
    doc: `An own layout (slots: ${slots.join(', ') || 'none'}).`,
    slots,
    build(parts, bySlot) {
      const conv = (n: KNode): Element[] => {
        if (n.name === 'slot') return n.args[0] === undefined ? parts : bySlot[String(n.args[0])] ?? [];
        if (n.name !== 'row' && n.name !== 'col' && n.name !== 'grid') return [];
        const kids = n.children.flatMap(conv);
        const props = layoutProps(n);
        if (n.name === 'grid') {
          const per = Number(n.props.columns) || 2;
          const rows: Element[] = [];
          for (let k = 0; k < kids.length; k += per) rows.push({ kind: 'row', props: {}, at: 0, children: kids.slice(k, k + per) });
          return [{ kind: 'col', props, at: 0, children: rows }];
        }
        return [{ kind: n.name, props, at: 0, children: kids }];
      };
      return { kind: 'col', props: {}, at: 0, children: def.children.flatMap(conv) };
    },
  };
}

/** the slide: properties, slots, layout */
function compileSlide(node: KNode, top: TopCtx) {
  const ctx = top.lowerCtx();
  const reg = top.registry;
  const p = node.props;
  const own: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'align') own.halign = String(v);
    else if (k === 'columns' || k === 'layout') continue;
    else own[k] = String(v);
  }
  let name = p.layout !== undefined ? String(p.layout) : undefined;
  const has = (s: string) => node.children.some((c) => c.name === s);
  if (!name && (has('left') || has('right') || has('middle'))) name = has('middle') ? 'three-cols' : 'two-cols';
  let layout = name ? reg.layout(name) : undefined;
  if (name && !layout) ctx.fail(node, `unknown layout \`${name}\` (built in: ${Object.keys(reg.layouts()).join(', ')})`);

  const main: Element[] = [];
  const slots: Record<string, Element[]> = {};
  const slotNames = layout?.slots ?? [];
  const pending: KNode[] = [];
  const flush = () => { main.push(...ctx.lower(pending.splice(0))); };
  for (const c of node.children) {
    if (slotNames.includes(c.name)) { flush(); slots[c.name] = [...(slots[c.name] ?? []), ...ctx.lower(c.children)]; }
    else pending.push(c);
  }
  flush();
  if (!name) { name = 'default'; layout = reg.layout(name)!; }
  const root = layout!.build(main, slots, { columns: p.columns !== undefined ? String(p.columns) : undefined });
  const fixed: Record<string, string> = { ...(layout!.defaults ?? {}), ...own, layout: name };
  const r = ctx.result();
  top.slides.push({
    meta: fixed, own: fixed, root, notes: r.notes, title: fixed.title || r.title || '(untitled)', url: top.url,
    stages: r.stages, autoplay: r.autoplay, line: node.line,
  });
}

const slideNode: NodeDef = {
  doc: 'One slide: a column of what you write, top to bottom. A `row` or `col` takes the height that is left (several share it); `layout=` names another layout.',
  props: {
    layout: { doc: 'a built-in or own layout (default: one column, as written)', valuesFrom: 'layouts' },
    columns: { doc: 'proportions of the columns, e.g. "1 2"' },
    ...ALIGN,
    theme: { doc: 'the theme for this slide only', valuesFrom: 'themes' },
    background: { doc: 'an image or looping video (relative to the file), or any CSS background: `linear-gradient(…)`, `#123`' },
    transition: { doc: 'how the content comes in and the old one leaves (what is on both slides glides whatever it is, except for `none`)', valuesFrom: 'transitions', default: 'fade' },
    hidden: { doc: 'left out of the show and the PDF (stays in the file)', values: ['#true', '#false'] },
    autoplay: { doc: 'seconds per step when the deck plays itself', type: 'number' },
    header: { doc: '`off` hides the deck\'s header here', values: ['off', 'on'] },
    footer: { doc: '`off` hides the deck\'s footer here', values: ['off', 'on'] },
    title: { doc: 'the name shown in the presenter view and the drawer (default: the `title` node)' },
    justify: { doc: 'justified paragraphs (the last line stays at the start)', values: ['#true', '#false'] },
    class: { doc: 'extra CSS class of the stage' },
  },
  children: ['part'],
  top: { phase: 2, compile: compileSlide },
};

export const coreLayout: Plugin = {
  name: 'core-layout',
  api: 1,
  nodes: {
    slide: slideNode,
    layout: {
      doc: 'An own layout: rows and columns with `slot`s, used as `slide layout=name { slotname { … } }`.',
      args: [{ name: 'name', doc: 'the name' }],
      props: { align: ALIGN.align, valign: ALIGN.valign },
      children: ['row', 'col', 'grid'],
      top: {
        phase: 1,
        compile(n, top) {
          const name = str(n.args[0]);
          if (!name) top.fail(n, '`layout` needs a name: layout "sidebar" { … }');
          try {
            top.registry.use({ name: `layout:${name}`, replaces: [name!], layouts: { [name!]: layoutFromNode(n) } });
          } catch (e) {
            if (e instanceof PluginError) top.fail(n, `the layout "${name}" is defined twice`);
            throw e;
          }
        },
      },
    },
    slot: { doc: 'In an own layout: where the content of the slot with this name goes (no name: the content that is in no slot).', args: [{ name: 'name', doc: 'the slot name', optional: true }] },
    row: { doc: 'Its children side by side, sharing the width.', part: true, props: LAYOUT, children: ['part'], lower: container('row') },
    col: { doc: 'Its children one under the other.', part: true, props: LAYOUT, children: ['part'], lower: container('col') },
    grid: {
      doc: 'Its children in a grid.', part: true,
      props: { columns: { doc: 'columns', type: 'number' }, gap: LAYOUT.gap, ...ALIGN, class: LAYOUT.class, size: LAYOUT.size },
      children: ['part'],
      lower(n, ctx) {
        const kids = ctx.lower(n.children);
        const per = Number(n.props.columns) || 2;
        const rows: Element[] = [];
        for (let k = 0; k < kids.length; k += per) rows.push(ctx.element('row', n, {}, kids.slice(k, k + per)));
        return ctx.element('col', n, layoutProps(n), rows);
      },
    },
  },
  layouts: builtinLayouts,
  runtime: () => import('./runtime.ts').then((m) => m.runtime),
};

