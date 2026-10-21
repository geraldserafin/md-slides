// Time on a slide: `pause` and `step` (what follows, or what is inside, comes in on the next click) and `swap` (the children take
// turns in one place). Everything here is a rule for the stages of the elements; the runtime knows only that an element is
// there from one stage to another.
import { layoutProps } from '../../kernel/util.ts';
import { walk } from '../../kernel/lower.ts';
import type { Element, Plugin, PropDef } from '../../kernel/types.ts';

const FX: Record<string, PropDef> = { anim: { doc: 'how it comes in', valuesFrom: 'effects' } };

/** the leaves of an element (what is shown or hidden; the containers are always there) */
const leaves = (e: Element) => [...walk(e)].filter((x) => !x.children);

export const coreTimeline: Plugin = {
  name: 'core-timeline',
  api: 1,
  nodes: {
    step: {
      doc: 'Everything inside appears on the next click.', part: true, props: { anim: FX.anim }, children: ['part'],
      lower: (n, ctx) => ctx.scope(() => {
        ctx.advance();
        return ctx.inside(n.props.anim !== undefined ? { effect: String(n.props.anim) } : {}, () => ctx.lower(n.children));
      }),
    },
    pause: {
      doc: 'Everything below it appears on the next click.', part: true,
      lower(_n, ctx) {
        ctx.advance();
      },
    },
    swap: {
      doc: 'Shows one of its children at a time, all in the same place: a click swaps it for the next one (use a `col` for several things in one). `code` blocks with the same `id` in different children, and `code` directly in a swap, morph into each other.',
      part: true,
      props: {
        transition: { doc: 'how the next child comes in and the one before leaves', valuesFrom: 'transitions', default: 'morph' },
        anim: FX.anim,
        autoplay: { doc: 'the children take turns by themselves, this many seconds apart (no clicks)', type: 'number' },
        size: { doc: 'its share of the row/col' },
        class: { doc: 'extra CSS class' },
        align: { doc: 'horizontal alignment', values: ['left', 'center', 'right'] },
        valign: { doc: 'vertical alignment', values: ['top', 'middle', 'bottom'] },
      },
      flags: { loop: 'with autoplay: forth and back without end' },
      children: ['part'],
      lower(n, ctx) {
        if (n.children.length < 2) ctx.fail(n, 'a `swap` needs at least two things to take turns: with one, write the thing');
        const region = ctx.uid('r');
        const transition = n.props.transition !== undefined ? String(n.props.transition) : 'morph';
        const seconds = n.props.autoplay !== undefined ? Number(n.props.autoplay) : undefined;
        const base = ctx.stage;
        const patch = { region, transition, ...(n.props.anim !== undefined ? { effect: String(n.props.anim) } : {}) };
        const alts: Element[][] = [];
        const starts: number[] = [];
        n.children.forEach((child, i) => {
          // by hand each next child takes a click; on a timer they all start with the swap
          if (i > 0 && seconds === undefined) ctx.advance();
          starts.push(ctx.stage);
          alts.push(ctx.inside({ ...patch, phase: i, direct: true }, () => ctx.lower([child])));
        });
        if (seconds !== undefined) ctx.autoplay.push({ region, seconds, loop: n.args.includes('loop'), count: n.children.length });
        else
          alts.forEach((alt, i) => {
            if (i + 1 >= alts.length) return;
            // it leaves when the next one comes (an outer swap may have set an earlier end already)
            for (const e of alt.flatMap(leaves)) e.out = e.out === undefined ? starts[i + 1] : Math.min(e.out, starts[i + 1]);
          });
        ctx.stage = base;
        const kids = alts.map((alt) => (alt.length === 1 ? alt[0] : ctx.element('col', n, {}, alt)));
        return ctx.element('stack', n, { ...layoutProps(n), transition, ...(seconds !== undefined ? { autoplay: seconds } : {}) }, kids);
      },
    },
  },
};
