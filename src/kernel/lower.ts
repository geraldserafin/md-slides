// Lowering: the context a node's `lower` runs in, and the expansion of nodes written in the language itself (`plugin "ui" {
// node "callout" { body { … } } }`). The timeline of a slide is a cursor here: elements appear on the stage the cursor is at.
import type { Element, KNode, KValue, LowerCtx, NodeDef, Registry, SlideCtx } from './types.ts';

export class CompileError extends Error {
  file?: string;
  line: number;
  col: number;
  constructor(message: string, line: number, col = 1, file?: string) {
    super(file ? `${file}, line ${line}: ${message}` : `line ${line}: ${message}`);
    this.line = line;
    this.col = col;
    this.file = file;
  }
}

/** `{text}` / `{prop}` in the strings of a template; a string that is only a placeholder keeps the type of the value */
function fill(v: KValue, use: KNode, def: NodeDef): KValue {
  if (typeof v !== 'string' || !v.includes('{')) return v;
  const value = (name: string): KValue | undefined => {
    if (name === 'text') return use.args.find((a) => typeof a === 'string' && !(def.flags && a in def.flags));
    if (use.props[name] !== undefined) return use.props[name];
    return def.props?.[name]?.default;
  };
  const whole = /^\{([\w-]+)\}$/.exec(v);
  if (whole) return value(whole[1]) ?? v;
  return v.replace(/\{([\w-]+)\}/g, (m, n: string) => {
    const x = value(n);
    return x === undefined ? m : String(x);
  });
}

/** the nodes a node written in the language stands for: the template with the use's text, properties and children put in */
export function instantiate(def: NodeDef, use: KNode): KNode[] {
  const copy = (n: KNode): KNode[] => {
    if (n.name === 'slot') return use.children;
    return [{
      ...n,
      args: n.args.map((a) => fill(a, use, def)),
      props: Object.fromEntries(Object.entries(n.props).map(([k, v]) => [k, fill(v, use, def)])),
      children: n.children.flatMap(copy),
      line: use.line,
      col: use.col,
      endLine: use.endLine,
    }];
  };
  return (def.expand ?? []).flatMap(copy);
}

export function createLowerCtx(registry: Registry, url: string, index: number): SlideCtx {
  let uids = 0;
  let title = '';
  const ctx: SlideCtx = {
    registry, url, index,
    stage: 0,
    clicks: 0,
    inherit: {},
    direct: false,
    notes: [],
    autoplay: [],
    advance() {
      ctx.stage = ++ctx.clicks;
      return ctx.stage;
    },
    scope<T>(fn: () => T): T {
      const saved = ctx.stage;
      try {
        return fn();
      } finally {
        ctx.stage = saved;
      }
    },
    inside<T>(patch: Partial<LowerCtx['inherit']>, fn: () => T): T {
      const saved = ctx.inherit;
      ctx.inherit = { ...saved, ...patch };
      try {
        return fn();
      } finally {
        ctx.inherit = saved;
      }
    },
    element(kind: string, node: KNode, props: Record<string, unknown> = {}, children?: Element[]): Element {
      const el: Element = { kind, props, at: ctx.stage, line: node.line };
      if (children) el.children = children;
      const id = node.props.id;
      if (id !== undefined && id !== null) el.key = String(id);
      const effect = node.props.anim !== undefined ? String(node.props.anim) : ctx.inherit.effect;
      if (effect) el.effect = effect;
      if (ctx.inherit.transition) el.transition = ctx.inherit.transition;
      if (ctx.inherit.region) { el.region = ctx.inherit.region; el.phase = ctx.inherit.phase; }
      ctx.clicks = Math.max(ctx.clicks, el.at);
      return el;
    },
    lower(nodes: KNode[]): Element[] {
      // a `pause` holds back what follows it in this list, not what follows the list
      const base = ctx.stage;
      const direct = ctx.inherit.direct === true;
      const saved = ctx.inherit;
      const out: Element[] = [];
      try {
        for (const n of nodes) {
          const def = registry.node(n.name);
          if (!def) ctx.fail(n, `unknown node \`${n.name}\``);
          // the nodes below this one are not direct children of a swap
          ctx.inherit = { ...saved, direct: false };
          ctx.direct = direct;
          if (def!.expand) out.push(...ctx.lower(instantiate(def!, n)));
          else if (def!.lower) {
            const r = def!.lower(n, ctx);
            if (r) out.push(...(Array.isArray(r) ? r : [r]));
          } else if (def!.render) {
            // a node that only says how to draw itself: the element has its properties and text
            const text = n.args.find((a) => typeof a === 'string' && !(def!.flags && a in def!.flags));
            out.push(ctx.element(n.name, n, { ...(text !== undefined ? { text: String(text) } : {}), ...Object.fromEntries(Object.entries(n.props).filter(([k]) => k !== 'id' && k !== 'anim').map(([k, v]) => [k, v])) }));
          } else if (!def!.top) ctx.fail(n, `\`${n.name}\` is not allowed here`);
        }
      } finally {
        ctx.inherit = saved;
        ctx.direct = false;
        ctx.stage = base;
      }
      return out;
    },
    fail(node: KNode, message: string): never {
      throw new CompileError(message, node.line, node.col);
    },
    uid(prefix: string) {
      return `${prefix}${index}.${++uids}`;
    },
    resolve(src: string) {
      try {
        return new URL(src, url).href;
      } catch {
        return src;
      }
    },
    heading(text: string) {
      if (!title) title = text;
    },
    result() {
      return { notes: ctx.notes, title, stages: ctx.clicks + 1, autoplay: ctx.autoplay };
    },
  };
  return ctx;
}

/** every element of a tree, depth first */
export function* walk(el: Element): Generator<Element> {
  yield el;
  for (const c of el.children ?? []) yield* walk(c);
}
