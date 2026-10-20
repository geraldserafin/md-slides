// Checks a .slide file against the schema: unknown tags and attributes, tags in the wrong place, bad values, stray text.
// Used by `slides check` and by the editor tooling. Imports only the parser and the schema, so node loads it directly.
import { MarkupError, parseMarkup, type El } from './markup.ts';
import { childrenOf, FX, SLIDE_SETTINGS, TAGS } from './schema.ts';

export interface Problem {
  line: number;
  message: string;
}

/** all the tags a tag may hold in the slide markup; text inside a tag is fine where it holds inline content */
const holdsText = (tag: string) => TAGS[tag]?.children?.includes('inline') ?? false;

export function check(src: string): Problem[] {
  const out: Problem[] = [];
  const add = (line: number, message: string) => out.push({ line, message });
  let nodes: (El | string)[];
  try {
    nodes = parseMarkup(src);
  } catch (e) {
    if (e instanceof MarkupError) return [{ line: e.line, message: e.message.replace(/^line \d+: /, '') }];
    throw e;
  }

  const walk = (children: (El | string)[], parent: string, line: number) => {
    const allowed = parent === '' ? Object.keys(TAGS).filter((t) => TAGS[t].in.includes('slide')) : childrenOf(parent);
    for (const n of children) {
      if (typeof n === 'string') {
        if (n.trim() && !holdsText(parent)) add(line, `text outside a tag: ${JSON.stringify(n.trim().slice(0, 30))}${parent === '' || !holdsText(parent) ? ' (put it in a <p>)' : ''}`);
        continue;
      }
      const def = TAGS[n.tag];
      if (!def) { add(n.line, `unknown tag <${n.tag}>`); continue; }
      if (!allowed.includes(n.tag)) add(n.line, `<${n.tag}> is not allowed ${parent ? `inside <${parent}>` : 'at the top of a slide'}`);
      const attrs = { ...(def.attrs ?? {}) };
      for (const [k, v] of Object.entries(n.attrs)) {
        const a = attrs[k];
        if (!a) { add(n.line, `unknown attribute \`${k}\` on <${n.tag}>`); continue; }
        if (a.values && !a.values.includes(v) && !(a.flag && v === 'true')) add(n.line, `<${n.tag} ${k}=…>: expected ${a.values.join(' | ')}, got \`${v}\``);
        if ((k === 'at' || k === 'out') && !/^\d+$/.test(v)) add(n.line, `<${n.tag} ${k}=…>: expected a number, got \`${v}\``);
      }
      if (def.empty && n.children.length) add(n.line, `<${n.tag}> has no content`);
      if (n.tag === 'slide') {
        const text = typeof n.children[0] === 'string' ? n.children[0] : '';
        text.split('\n').forEach((l, i) => {
          const m = /^\s*([^\s:#][^:]*?)\s*:\s*(.*?)\s*$/.exec(l);
          if (!m || m[1].startsWith('--') || l.trimStart().startsWith('#')) return;
          const line = n.line + i;
          const s = SLIDE_SETTINGS[m[1]];
          if (!s) add(line, `unknown setting \`${m[1]}\` in <slide>`);
          else if (s.values && !s.values.includes(m[2]) && m[1] !== 'theme') add(line, `${m[1]}: expected ${s.values.join(' | ')}, got \`${m[2]}\``);
        });
      }
      if (def.raw) {
        if (n.tag === 'code' && n.attrs.from === undefined && n.attrs.lang === undefined) add(n.line, '<code> needs a `lang`');
        continue;
      }
      if (n.tag === 'img' || n.tag === 'video' || n.tag === 'audio') {
        if (!n.attrs.src) add(n.line, `<${n.tag}> needs a \`src\``);
      }
      walk(n.children, n.tag, n.line);
    }
  };
  walk(nodes, '', 1);
  void FX;
  return out;
}
