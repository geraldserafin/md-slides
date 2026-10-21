// Plugins as they are written in a file: a plugin object of the current API, or one of the first format
// (`{ name, tags: { badge: { doc, attrs, render({ tag, attrs, text, el, base }) } }, themes, languages, tools, hooks }`),
// which is turned into the current one.
import type { NodeDef, Plugin, PropDef } from './types.ts';

interface FirstFormatTag {
  doc?: string;
  attrs?: Record<string, PropDef>;
  render?(ctx: { tag: string; attrs: Record<string, unknown>; text: string; el: HTMLElement; base: string }): unknown;
}

/** a module's default export as a plugin of the current API */
export function toPlugin(mod: unknown, fallbackName: string): Plugin {
  const m = (mod ?? {}) as Record<string, unknown> & { tags?: Record<string, FirstFormatTag> };
  const plugin = { ...m, name: typeof m.name === 'string' ? m.name : fallbackName } as Plugin & { tags?: Record<string, FirstFormatTag> };
  if (m.tags) {
    const nodes: Record<string, NodeDef> = { ...(plugin.nodes ?? {}) };
    for (const [name, t] of Object.entries(m.tags)) {
      nodes[name] = {
        doc: t.doc ?? '', part: true, args: [{ name: 'text', doc: 'the text of the node', optional: true }], props: t.attrs ?? {},
        render: t.render ? (ctx) => t.render!({ tag: name, attrs: Object.fromEntries(Object.entries(ctx.element.props).filter(([k]) => k !== 'text')), text: String(ctx.element.props.text ?? ''), el: ctx.el, base: ctx.base }) as never : undefined,
      };
    }
    plugin.nodes = nodes;
    delete plugin.tags;
  }
  return plugin;
}
