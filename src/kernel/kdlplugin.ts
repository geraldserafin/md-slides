// A plugin written in the language itself: no JS, so it works anywhere a deck does.
//
//   plugin "ui" {
//     node "callout" doc="A box with a kind" {
//       arg "text" doc="what it says"
//       prop "kind" values="info warn" default="info" doc="its color"
//       body { col class="callout-{kind}" { text "{text}"; slot } }     // `slot` is the children of the use
//     }
//     effect "flip" pose="transform: rotateY(80deg)" doc="comes in turned"
//     theme "sunset" --bg="#2a1b2e" --fg="#f0d4c0"
//   }
import { CompileError } from './lower.ts';
import type { ArgDef, KNode, NodeDef, Plugin, PropDef } from './types.ts';

const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));

export function pluginFromKdl(n: KNode): Plugin {
  const name = str(n.args[0]);
  if (!name) throw new CompileError('`plugin` needs a name: plugin "ui" { … }', n.line, n.col);
  const plugin: Plugin = { name: `kdl:${name}`, nodes: {}, effects: {}, themes: {} };
  for (const c of n.children) {
    const cname = str(c.args[0]);
    switch (c.name) {
      case 'node': {
        if (!cname) throw new CompileError('`node` needs a name: node "callout" { … }', c.line, c.col);
        const args: ArgDef[] = [];
        const props: Record<string, PropDef> = {};
        const flags: Record<string, string> = {};
        let body: KNode[] | undefined;
        for (const d of c.children) {
          const dn = str(d.args[0]);
          if (d.name === 'arg') args.push({ name: dn ?? 'text', doc: str(d.props.doc) ?? '', optional: d.props.optional === true });
          else if (d.name === 'prop') {
            if (!dn) throw new CompileError('`prop` needs a name', d.line, d.col);
            props[dn] = {
              doc: str(d.props.doc) ?? '', values: str(d.props.values)?.split(/\s+/).filter(Boolean), default: str(d.props.default),
              type: d.props.type === 'number' ? 'number' : undefined,
            };
          } else if (d.name === 'flag') flags[dn ?? ''] = str(d.props.doc) ?? '';
          else if (d.name === 'body') body = d.children;
          else throw new CompileError(`unknown \`${d.name}\` in a node definition (arg, prop, flag, body)`, d.line, d.col);
        }
        if (!body) throw new CompileError(`the node "${cname}" has no \`body\``, c.line, c.col);
        const hasSlot = JSON.stringify(body, (_k, v) => v).includes('"name":"slot"');
        const def: NodeDef = { doc: str(c.props.doc) ?? '', part: true, expand: body, args, props, flags, ...(hasSlot ? { children: ['part'] } : {}) };
        plugin.nodes![cname] = def;
        break;
      }
      case 'effect':
        if (!cname) throw new CompileError('`effect` needs a name: effect "flip" pose="…"', c.line, c.col);
        plugin.effects![cname] = { doc: str(c.props.doc) ?? '', pose: str(c.props.pose), css: str(c.props.css) };
        break;
      case 'theme':
        if (!cname) throw new CompileError('`theme` needs a name: theme "sunset" --bg="…"', c.line, c.col);
        plugin.themes![cname] = Object.fromEntries(Object.entries(c.props).map(([k, v]) => [k, String(v)]));
        break;
      default:
        throw new CompileError(`unknown \`${c.name}\` in a plugin (node, effect, theme)`, c.line, c.col);
    }
  }
  return plugin;
}
