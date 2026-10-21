// The DOM side of the containers: `row` (parts side by side), `col` (stacked) and `stack` (a `swap`: the children in one place).
import type { PluginRuntime, RenderCtx } from '../../kernel/types.ts';

/**
 * The share of a part of a row or col: `size=2` (a weight), `size=auto` (the size of its content), `size=40%` or any
 * CSS length. `fill` is the default of parts that share what is left.
 */
export function setSize(el: HTMLElement, size: string | undefined, fill: boolean) {
  const v = (size ?? '').trim();
  const w = /^(\d*\.?\d+)(fr)?$/.exec(v);
  el.style.flex = w ? `${w[1]} 1 0` : v === 'auto' ? '0 0 auto' : v ? `0 0 ${v}` : fill ? '1 1 0' : '';
}

const word = (v: unknown) => (v === undefined ? undefined : String(v));

/** the alignment a container hands down: its own wins over what it got */
const aligned = (ctx: RenderCtx) => {
  const p = ctx.element.props;
  return { h: ctx.align(word(p.align)) ?? ctx.h, v: ctx.align(word(p.valign)) ?? ctx.v };
};

const decorate = (ctx: RenderCtx) => {
  const p = ctx.element.props;
  if (p.class) ctx.el.classList.add(...String(p.class).split(/\s+/));
  if (p.gap) ctx.el.style.gap = /^\d+(\.\d+)?$/.test(String(p.gap)) ? `${p.gap}vmin` : String(p.gap);
};

export const runtime: PluginRuntime = {
  render: {
    row(ctx) {
      const { h, v } = aligned(ctx);
      ctx.el.className = 'row';
      setSize(ctx.el, word(ctx.element.props.size), true);
      decorate(ctx);
      ctx.children(ctx.el, undefined, { h, v, cells: ctx.element.children?.length ?? 1, inRow: true });
    },
    col(ctx) {
      const { h, v } = aligned(ctx);
      ctx.el.className = 'cell text';
      setSize(ctx.el, word(ctx.element.props.size), true);
      if (h) ctx.el.dataset.h = h;
      if (v) ctx.el.dataset.v = v;
      decorate(ctx);
      ctx.children(ctx.el, undefined, { h, v, cells: ctx.cells, inRow: false });
    },
    stack(ctx) {
      const { h, v } = aligned(ctx);
      ctx.el.className = 'stack';
      setSize(ctx.el, word(ctx.element.props.size), false); // as big as what it shows, like the item it stands for
      decorate(ctx);
      ctx.children(ctx.el, undefined, { h, v, cells: ctx.cells, inRow: false });
    },
  },
};
