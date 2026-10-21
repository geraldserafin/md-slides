// Checks a .slides file against the schema: unknown nodes, properties and flags, nodes in the wrong place, bad values, missing
// texts. Used by `slides check` and by the editor tooling. Imports only the parser and the schema, so node loads it directly.
import { KdlError, parseKdl, type KNode, type KValue } from './kdl.ts';
import { childrenOf, LAYOUTS, NODES, PART_NODES, type NodeDef } from './schema.ts';

export interface Problem {
  line: number;
  col: number;
  message: string;
}

/** the name of `options` closest to `s` (a typo), if any is close enough */
export function closest(s: string, options: string[]): string | undefined {
  const dist = (a: string, b: string) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  let best: string | undefined;
  let bestD = Math.max(2, Math.floor(s.length / 3)) + 1;
  for (const o of options) {
    const x = dist(s.toLowerCase(), o.toLowerCase());
    if (x < bestD) { best = o; bestD = x; }
  }
  return best;
}

const show = (v: KValue) => (v === true ? '#true' : v === false ? '#false' : String(v));
const FREE_CHILDREN = new Set(['vars', 'themes']);
const LAYOUT_KINDS = ['row', 'col', 'grid', 'slot'];

/** the slot names a slide may use for a layout: those of the built-in one, or of the own one defined in the file */
const slotsIn = (n: KNode): string[] => n.children.flatMap((c) => (c.name === 'slot' && c.args[0] !== undefined ? [String(c.args[0])] : slotsIn(c)));

export function check(src: string, extraLayouts: Record<string, string[]> = {}): Problem[] {
  const out: Problem[] = [];
  const add = (n: { line: number; col: number }, message: string) => out.push({ line: n.line, col: n.col, message });
  let nodes: KNode[];
  try {
    nodes = parseKdl(src);
  } catch (e) {
    if (e instanceof KdlError) return [{ line: e.line, col: e.col, message: e.message.replace(/^line \d+: /, '') }];
    throw e;
  }

  const own: Record<string, string[]> = { ...extraLayouts };
  for (const n of nodes) if (n.name === 'layout' && n.args[0] !== undefined) own[String(n.args[0])] = slotsIn(n);
  const layoutNames = [...Object.keys(LAYOUTS), ...Object.keys(own)];
  let decks = 0;

  const checkNode = (n: KNode, def: NodeDef) => {
    // arguments: positional ones in order, then flags
    const flags = def.flags ?? {};
    let pos = 0;
    for (const a of n.args) {
      if (typeof a === 'string' && flags[a] !== undefined) continue;
      const slot = def.args?.[Math.min(pos, (def.args?.length ?? 1) - 1)];
      if (!def.args || (pos >= def.args.length && !def.rest)) {
        const hint = typeof a === 'string' ? closest(a, Object.keys(flags)) : undefined;
        add(n, `\`${n.name}\`: unexpected ${typeof a === 'string' ? `word \`${a}\`` : `value ${show(a)}`}${hint ? ` (did you mean \`${hint}\`?)` : Object.keys(flags).length ? ` (flags: ${Object.keys(flags).join(', ')})` : ''}`);
      } else if (slot?.values && !slot.values.includes(String(a))) add(n, `\`${n.name}\`: ${slot.name} must be ${slot.values.join(' | ')}, got \`${show(a)}\``);
      pos++;
    }
    const required = (def.args ?? []).filter((a) => !a.optional).length;
    if (pos < required) add(n, `\`${n.name}\` needs ${def.args![pos].name}: ${n.name} ${(def.args ?? []).filter((a) => !a.optional).map((a) => `"${a.name}"`).join(' ')}`);
    // properties
    for (const [k, v] of Object.entries(n.props)) {
      if (k.startsWith('--') && (n.name === 'slide' || n.name === 'vars')) continue;
      if (FREE_CHILDREN.has(n.name)) continue;
      const p = def.props?.[k];
      if (!p) {
        const hint = closest(k, Object.keys(def.props ?? {}));
        add(n, `unknown property \`${k}\` on \`${n.name}\`${hint ? ` (did you mean \`${hint}\`?)` : ''}`);
        continue;
      }
      if (p.type === 'number' && typeof v !== 'number') add(n, `\`${n.name} ${k}=…\`: expected a number, got \`${show(v)}\``);
      else if (p.values && !p.values.includes(show(v)) && !(p.values.includes('#true') && typeof v === 'boolean')) add(n, `\`${n.name} ${k}=…\`: expected ${p.values.join(' | ')}, got \`${show(v)}\``);
    }
  };

  const walk = (children: KNode[], parent: string, slideLayout?: string) => {
    let allowed = parent === 'part' ? PART_NODES : childrenOf(parent);
    if (parent === 'slide') {
      const slots = slideLayout ? own[slideLayout] ?? LAYOUTS[slideLayout]?.slots ?? [] : [...new Set(Object.values(own).flat()), 'left', 'middle', 'right'];
      allowed = [...allowed, ...slots];
    }
    for (const n of children) {
      const slot = parent === 'slide' && !NODES[n.name] && allowed.includes(n.name);
      const def = NODES[n.name];
      if (slot) { walk(n.children, 'part'); continue; }
      if (parent === 'themes') { walk(n.children, n.name); continue; }
      if (!def) {
        const hint = closest(n.name, allowed);
        add(n, `unknown node \`${n.name}\`${hint ? ` (did you mean \`${hint}\`?)` : ''}`);
        continue;
      }
      if (!allowed.includes(n.name)) add(n, `\`${n.name}\` is not allowed ${parent ? `inside \`${parent}\`` : 'here'}`);
      checkNode(n, def);
      if (n.name === 'code') {
        const hasFrames = n.children.some((c) => c.name === 'frame');
        const inline = n.args.slice(1).some((a) => typeof a === 'string' && !(def.flags ?? {})[a]);
        if (n.props.from === undefined && n.args[0] === undefined) add(n, '`code` needs a language: code "rust" …');
        if (n.props.from === undefined && !hasFrames && !inline) add(n, '`code` has no code: add `frame`s or the code as a second argument');
      }
      if (n.name === 'slot' && parent !== 'layout' && parent !== 'row' && parent !== 'col' && parent !== 'grid') add(n, '`slot` belongs in a `layout`');
      if (n.children.length) {
        if (def.children || n.name === 'themes') walk(n.children, n.name);
        else add(n.children[0], `\`${n.name}\` has no children`);
      }
    }
  };
  /** inside an own layout, rows and columns hold rows, columns and slots */
  const walkLayout = (children: KNode[]) => {
    for (const c of children) {
      if (c.name === 'slot') { checkNode(c, NODES.slot); continue; }
      if (!['row', 'col', 'grid'].includes(c.name)) continue;
      checkNode(c, NODES[c.name]);
      walkLayout(c.children);
    }
  };

  const top = new Set(['deck', 'slide', 'layout']);
  for (const n of nodes) {
    if (!top.has(n.name)) {
      const hint = closest(n.name, [...top]);
      add(n, `\`${n.name}\` at the top: a file holds \`deck\`, \`layout\` and \`slide\` nodes${hint ? ` (did you mean \`${hint}\`?)` : ''}`);
      continue;
    }
    if (n.name === 'layout') {
      checkNode(n, NODES.layout);
      for (const c of n.children) if (!LAYOUT_KINDS.includes(c.name)) add(c, `\`${c.name}\` in a layout (rows, columns and slots only)`);
      walkLayout(n.children);
      continue;
    }
    if (n.name === 'deck' && ++decks > 1) add(n, 'a second `deck`: the settings of the deck go in one');
    checkNode(n, NODES[n.name]);
    walk(n.children, n.name, n.name === 'slide' && n.props.layout !== undefined ? String(n.props.layout) : undefined);
    if (n.name === 'slide') {
      const l = n.props.layout;
      if (l !== undefined && !layoutNames.includes(String(l))) {
        const hint = closest(String(l), layoutNames);
        add(n, `unknown layout \`${l}\`${hint ? ` (did you mean \`${hint}\`?)` : ` (built in: ${Object.keys(LAYOUTS).join(', ')})`}`);
      }
    }
  }
  return out;
}

/** the own layouts a file defines, with their slot names: so another file of the deck may use them */
export function layoutsOf(src: string): Record<string, string[]> {
  try {
    return Object.fromEntries(parseKdl(src).filter((n) => n.name === 'layout' && n.args[0] !== undefined).map((n) => [String(n.args[0]), slotsIn(n)]));
  } catch {
    return {};
  }
}
