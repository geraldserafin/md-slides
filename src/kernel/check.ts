// Checks a .slides file against what the plugins say about the language: unknown nodes, properties and flags, nodes in the wrong
// place, bad values, missing texts. Used by `slides check` and by the editor tooling; it runs in node.
import { KdlError, parseKdl } from './kdl.ts';
import { closest } from './closest.ts';
import { CompileError, instantiate } from './lower.ts';
import { run, type ParsedFile } from './compile.ts';
import type { DeckMeta, KNode, KValue, NodeDef, PropDef, Registry } from './types.ts';

export interface Problem {
  line: number;
  col: number;
  message: string;
}

const show = (v: KValue) => (v === true ? '#true' : v === false ? '#false' : String(v));

/** the names a `valuesFrom` property may take */
export function valuesOf(p: PropDef | undefined, reg: Registry): string[] | undefined {
  if (!p) return undefined;
  if (p.valuesFrom) return Object.keys({ transitions: reg.transitions(), effects: reg.effects(), layouts: reg.layouts(), themes: reg.themes() }[p.valuesFrom]);
  return p.values;
}

const parseOr = (text: string): KNode[] => {
  try {
    return parseKdl(text);
  } catch {
    return [];
  }
};

/**
 * `siblings`: the texts of the other files of the deck, whose plugins and layouts this file may use.
 * The registry is the one of the stock plugins plus the deck's JS plugins; what the sources declare is added here.
 */
export function check(src: string, base: Registry, siblings: string[] = []): Problem[] {
  const out: Problem[] = [];
  const add = (n: { line: number; col: number }, message: string) => out.push({ line: n.line, col: n.col, message });
  let nodes: KNode[];
  try {
    nodes = parseKdl(src);
  } catch (e) {
    if (e instanceof KdlError) return [{ line: e.line, col: e.col, message: e.message.replace(/^line \d+: /, '') }];
    throw e;
  }

  // what the sources declare: plugins written in the language, own layouts
  const reg = base.fork();
  const files: ParsedFile[] = [...siblings.map((t, i) => ({ f: { url: `sibling${i}`, text: t }, nodes: parseOr(t) })), { f: { url: 'this', text: src }, nodes }];
  const meta: DeckMeta = { files: [] };
  try {
    run(files, reg, meta, [], 1);
  } catch (e) {
    if (e instanceof CompileError) add({ line: e.line, col: e.col }, e.message.replace(/^(.*?, )?line \d+: /, ''));
  }
  // the themes the deck defines are themes the slides may name
  if (meta.themes) reg.use({ name: 'themes:deck', themes: meta.themes });

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
      if (k.startsWith('--') && ['slide', 'vars', 'theme'].includes(n.name)) continue;
      if (n.name === 'vars' || n.name === 'theme') continue;
      const p = def.props?.[k];
      if (!p) {
        const hint = closest(k, Object.keys(def.props ?? {}));
        add(n, `unknown property \`${k}\` on \`${n.name}\`${hint ? ` (did you mean \`${hint}\`?)` : ''}`);
        continue;
      }
      if (p.valuesFrom === 'layouts') continue; // an unknown layout is reported below, with a hint
      const values = valuesOf(p, reg);
      if (p.type === 'number' && typeof v !== 'number') add(n, `\`${n.name} ${k}=…\`: expected a number, got \`${show(v)}\``);
      else if (values && !values.includes(show(v)) && !(values.includes('#true') && typeof v === 'boolean')) add(n, `\`${n.name} ${k}=…\`: expected ${values.join(' | ')}, got \`${show(v)}\``);
    }
  };

  const slotsFor = (layout: string | undefined): string[] =>
    layout ? reg.layout(layout)?.slots ?? [] : [...new Set([...Object.values(reg.layouts()).flatMap((l) => l.slots ?? []), 'left', 'middle', 'right'])];

  const walk = (children: KNode[], parent: string, slideLayout?: string) => {
    let allowed = parent === 'part' ? reg.parts() : reg.childrenOf(parent);
    if (parent === 'slide') allowed = [...allowed, ...slotsFor(slideLayout)];
    for (const n of children) {
      const def = reg.node(n.name);
      const slot = parent === 'slide' && !def && allowed.includes(n.name);
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
        const inline = n.args.slice(1).some((a) => typeof a === 'string' && !(def.flags ?? {})[a]);
        if (n.props.from === undefined && n.args[0] === undefined) add(n, '`code` needs a language: code "rust" "…"');
        if (n.props.from === undefined && !inline) add(n, '`code` has no code: write it as the second argument: code "ts" "let a = 1;"');
      }
      if (n.name === 'swap') {
        if (n.children.length < 2) add(n, 'a `swap` needs at least two things to take turns: with one, write the thing');
        if (n.props.autoplay === undefined && n.args.includes('loop')) add(n, '`loop` needs `autoplay`');
      }
      if (n.name === 'slot' && !['layout', 'row', 'col', 'grid'].includes(parent)) add(n, '`slot` belongs in a `layout`');
      if (n.children.length) {
        if (n.name === 'body') continue; // a template: its nodes are checked where the node is used
        if (def.children || n.name === 'themes') walk(n.children, n.name);
        else add(n.children[0], `\`${n.name}\` has no children`);
      }
    }
  };
  /** inside an own layout, rows and columns hold rows, columns and slots */
  const walkLayout = (children: KNode[]) => {
    for (const c of children) {
      if (c.name === 'slot') { checkNode(c, reg.node('slot')!); continue; }
      if (!['row', 'col', 'grid'].includes(c.name)) { add(c, `\`${c.name}\` in a layout (rows, columns and slots only)`); continue; }
      checkNode(c, reg.node(c.name)!);
      walkLayout(c.children);
    }
  };

  for (const n of nodes) {
    const def = reg.node(n.name);
    if (!def?.top) {
      const tops = reg.topNodes();
      const hint = closest(n.name, tops);
      add(n, `\`${n.name}\` at the top: a file holds ${tops.map((t) => `\`${t}\``).join(', ')} nodes${hint ? ` (did you mean \`${hint}\`?)` : ''}`);
      continue;
    }
    if (n.name === 'layout') {
      checkNode(n, def);
      walkLayout(n.children);
      continue;
    }
    if (n.name === 'deck' && ++decks > 1) add(n, 'a second `deck`: the settings of the deck go in one');
    checkNode(n, def);
    if (n.name === 'slide' && n.props.layout !== undefined && !reg.layout(String(n.props.layout))) {
      const hint = closest(String(n.props.layout), Object.keys(reg.layouts()));
      add(n, `unknown layout \`${n.props.layout}\`${hint ? ` (did you mean \`${hint}\`?)` : ` (built in: ${Object.keys(reg.layouts()).join(', ')})`}`);
    }
    walk(n.children, n.name, n.name === 'slide' && n.props.layout !== undefined ? String(n.props.layout) : undefined);
  }
  void instantiate;
  return out;
}

/** the registry with what the sources declare added: plugins written in the language, own layouts (for completion and `check`) */
export function declared(base: Registry, texts: string[]): Registry {
  const reg = base.fork();
  const files: ParsedFile[] = texts.map((t, i) => ({ f: { url: `src${i}`, text: t }, nodes: parseOr(t) }));
  const meta: DeckMeta = { files: [] };
  try {
    run(files, reg, meta, [], 1);
  } catch {
    /* `check` reports it */
  }
  if (meta.themes) reg.use({ name: 'themes:deck', themes: meta.themes });
  return reg;
}
