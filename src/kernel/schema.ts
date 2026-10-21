// The registry as plain data: every node with its arguments, flags and properties, the layouts, transitions, effects, languages and
// themes. This is what editors, docs and other tools read (`slides schema` prints it).
import type { Registry } from './types.ts';

export function exportSchema(registry: Registry) {
  const nodes = Object.fromEntries(Object.entries(registry.nodes()).map(([name, d]) => {
    const { lower, render, expand, top, ...rest } = d;
    void lower; void render; void expand;
    return [name, { ...rest, ...(top ? { top: true } : {}), ...(expand ? { template: true } : {}) }];
  }));
  return {
    nodes,
    layouts: Object.fromEntries(Object.entries(registry.layouts()).map(([n, l]) => [n, { doc: l.doc, slots: l.slots ?? [], defaults: l.defaults ?? {} }])),
    transitions: Object.fromEntries(Object.entries(registry.transitions()).map(([n, t]) => [n, { doc: t.doc, props: t.props }])),
    effects: Object.fromEntries(Object.entries(registry.effects()).map(([n, e]) => [n, { doc: e.doc }])),
    languages: registry.languageTags(),
    themes: Object.keys(registry.themes()),
    plugins: registry.plugins.map((p) => p.name),
  };
}
