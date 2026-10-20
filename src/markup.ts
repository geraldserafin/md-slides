// The tag syntax of .slide files: <tag key=value flag key="a b"> ... </tag>, <tag ... /> for tags without content.
// The content of RAW tags (code, c, tex, chart, diagram, notes, slide) is not parsed: it runs to the closing tag, so
// `<` and `&` need no escaping there. `\</code>` writes a closing tag as text inside a raw tag.
// Anything outside a tag is returned as a string.

export interface El {
  tag: string;
  attrs: Record<string, string>;
  children: (El | string)[];
  line: number;
}

export class MarkupError extends Error {
  constructor(message: string, readonly line: number) {
    super(`line ${line}: ${message}`);
  }
}

export const RAW = new Set(['slide', 'code', 'chart', 'diagram', 'notes', 'tex', 'c']);

const OPEN = /^<([a-z][a-z0-9-]*)(?=[\s/>])/;
const CLOSE = /^<\/([a-z][a-z0-9-]*)\s*>/;

export function parseMarkup(src: string): (El | string)[] {
  const lineAt = (i: number) => src.slice(0, i).split('\n').length;
  const root: El = { tag: '', attrs: {}, children: [], line: 1 };
  const stack: El[] = [root];
  const top = () => stack[stack.length - 1];
  let text = 0; // start of the text not yet pushed
  let i = 0;
  const flush = (to: number) => {
    if (to > text) top().children.push(src.slice(text, to));
  };

  while (i < src.length) {
    if (src[i] !== '<') { i++; continue; }
    const rest = src.slice(i, i + 80);
    const close = CLOSE.exec(rest);
    if (close) {
      flush(i);
      const el = stack.pop()!;
      if (stack.length === 0 || el.tag !== close[1]) throw new MarkupError(`</${close[1]}> closes nothing${stack.length ? ` (open: <${el.tag}>)` : ''}`, lineAt(i));
      i += close[0].length;
      text = i;
      continue;
    }
    const open = OPEN.exec(rest);
    if (!open) { i++; continue; }
    flush(i);
    const el: El = { tag: open[1], attrs: {}, children: [], line: lineAt(i) };
    let j = i + open[0].length;
    let selfClosed = false;
    for (;;) {
      while (/\s/.test(src[j] ?? '')) j++;
      if (j >= src.length) throw new MarkupError(`<${el.tag}> is never closed with >`, el.line);
      if (src[j] === '>') { j++; break; }
      if (src[j] === '/' && src[j + 1] === '>') { selfClosed = true; j += 2; break; }
      const name = /^[^\s=>/]+/.exec(src.slice(j))![0];
      j += name.length;
      let value = 'true';
      if (src[j] === '=') {
        j++;
        const q = src[j];
        if (q === '"' || q === "'") {
          const end = src.indexOf(q, j + 1);
          if (end < 0) throw new MarkupError(`unterminated quote in <${el.tag}>`, el.line);
          value = src.slice(j + 1, end);
          j = end + 1;
        } else {
          let m = /^[^\s>]*/.exec(src.slice(j))![0];
          if (m.endsWith('/') && src[j + m.length] === '>') m = m.slice(0, -1); // `src=a.png/>`
          value = m;
          j += m.length;
        }
      }
      el.attrs[name] = value;
    }
    top().children.push(el);
    i = j;
    text = i;
    if (selfClosed) continue;
    if (RAW.has(el.tag)) {
      // content up to the first closing tag that is not escaped with a backslash
      const closer = `</${el.tag}>`;
      let end = i;
      for (;;) {
        end = src.indexOf(closer, end);
        if (end < 0) throw new MarkupError(`<${el.tag}> is never closed`, el.line);
        if (src[end - 1] !== '\\') break;
        end += closer.length;
      }
      el.children.push(src.slice(i, end).replace(/\\<\//g, '</'));
      i = end + closer.length;
      text = i;
    } else stack.push(el);
  }
  if (stack.length > 1) throw new MarkupError(`<${top().tag}> is never closed`, top().line);
  flush(src.length);
  return root.children;
}

/** the attributes of a tag written as a string: `lang=ts focus="2-4" muted` */
export function tagAttrs(s: string): Record<string, string> {
  const el = parseMarkup(`<x ${s} />`)[0] as El;
  return el.attrs;
}

/** removes the common indentation (and the blank lines around): how raw content is written inside indented tags */
export function dedent(s: string): string {
  const lines = s.split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length), Infinity);
  return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n');
}

/** the raw text of a raw tag */
export const rawText = (el: El) => (el.children[0] as string | undefined) ?? '';
