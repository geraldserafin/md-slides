// The language server of the slide markup: diagnostics (check.ts), completion and hover (schema.ts), over stdio.
// A hand-written JSON-RPC loop, so the package needs no dependency for it. Plain TypeScript, no framework: `slides lsp`
// runs it, and any editor with an LSP client can use it.
import { check } from './check.ts';
import { childrenOf, FX, TAGS } from './schema.ts';

interface Pos { line: number; character: number }

const docs = new Map<string, string>();

const send = (msg: object) => {
  const body = JSON.stringify({ jsonrpc: '2.0', ...msg });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
};

const offsetAt = (text: string, p: Pos) => {
  let off = 0;
  for (let l = 0; l < p.line; l++) {
    const i = text.indexOf('\n', off);
    if (i < 0) return text.length;
    off = i + 1;
  }
  return Math.min(off + p.character, text.length);
};

/** the tags that are open at `offset` (raw tags are skipped: what is inside them is not markup), innermost last */
export function openTags(text: string, offset: number): string[] {
  const stack: string[] = [];
  const re = /<(\/?)([a-z][a-z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  const head = text.slice(0, offset);
  let m: RegExpExecArray | null;
  while ((m = re.exec(head))) {
    const [, close, name, , self] = m;
    if (!TAGS[name]) continue;
    if (close) { const i = stack.lastIndexOf(name); if (i >= 0) stack.length = i; continue; }
    if (self || TAGS[name].empty) continue;
    if (TAGS[name].raw) {
      const end = text.indexOf(`</${name}>`, re.lastIndex);
      if (end < 0 || end >= offset) { stack.push(name); break; } // the cursor is inside the raw content
      re.lastIndex = end + name.length + 3;
      continue;
    }
    stack.push(name);
  }
  return stack;
}

const allowedHere = (stack: string[]): string[] =>
  stack.length === 0 ? Object.keys(TAGS).filter((t) => TAGS[t].in.includes('slide')) : childrenOf(stack[stack.length - 1]);

const md = (value: string) => ({ kind: 'markdown', value });

const tagItem = (name: string) => {
  const def = TAGS[name];
  const attrs = Object.entries(def.attrs ?? {}).filter(([k]) => !(k in FX) || name === 'step').map(([k]) => k).slice(0, 6);
  return {
    label: name, kind: 14, detail: def.empty ? `<${name} … />` : `<${name}>`, documentation: md(def.doc),
    insertText: def.empty ? `${name} $0/>` : `${name}>$0</${name}>`, insertTextFormat: 2,
    data: attrs,
  };
};

function complete(text: string, p: Pos) {
  const off = offsetAt(text, p);
  const line = text.slice(text.lastIndexOf('\n', off - 1) + 1, off);
  // a value: <tag attr=va|
  const val = /<([a-z][a-z0-9-]*)\b[^>]*?\s([a-z-]+)=["']?([^"'\s>]*)$/.exec(line);
  if (val) {
    const a = TAGS[val[1]]?.attrs?.[val[2]] ?? (FX as Record<string, { values?: string[] }>)[val[2]];
    return (a?.values ?? []).map((v) => ({ label: v, kind: 12 }));
  }
  // an attribute: <tag att|
  const attr = /<([a-z][a-z0-9-]*)\s(?:[^>]*\s)?([a-z-]*)$/.exec(line);
  if (attr && !line.slice(line.lastIndexOf('<')).includes('>')) {
    const have = new Set([...line.slice(line.lastIndexOf('<')).matchAll(/\s([a-z-]+)(?==|\s|$)/g)].map((m) => m[1]));
    return Object.entries(TAGS[attr[1]]?.attrs ?? {}).filter(([k]) => !have.has(k) || k === attr[2]).map(([k, a]) => ({
      label: k, kind: 5, detail: a.values ? a.values.join(' | ') : a.flag ? 'flag' : undefined, documentation: md(a.doc),
      insertText: a.flag ? k : `${k}=`, sortText: k in FX ? `z${k}` : k,
    }));
  }
  // a tag name: <na| or </na|
  const tag = /<(\/?)([a-z0-9-]*)$/.exec(line);
  if (tag) {
    const stack = openTags(text, off - tag[0].length);
    if (tag[1]) return stack.length ? [{ label: stack[stack.length - 1], kind: 14, insertText: `${stack[stack.length - 1]}>` }] : [];
    return allowedHere(stack).map(tagItem);
  }
  return [];
}

function hover(text: string, p: Pos) {
  const off = offsetAt(text, p);
  const ls = text.lastIndexOf('\n', off - 1) + 1;
  const le = text.indexOf('\n', off) < 0 ? text.length : text.indexOf('\n', off);
  const line = text.slice(ls, le);
  const col = off - ls;
  for (const m of line.matchAll(/<\/?([a-z][a-z0-9-]*)([^<>]*)/g)) {
    const start = m.index!;
    const nameEnd = start + m[0].indexOf(m[1]) + m[1].length;
    const def = TAGS[m[1]];
    if (!def) continue;
    if (col >= start && col <= nameEnd) {
      const attrs = Object.entries(def.attrs ?? {}).map(([k, a]) => `- \`${k}\`: ${a.doc}`).join('\n');
      return { contents: md(`**<${m[1]}>**: ${def.doc}${attrs ? `\n\n${attrs}` : ''}`) };
    }
    for (const a of m[2].matchAll(/\s([a-z-]+)/g)) {
      const s = start + m[0].indexOf(m[2]) + a.index! + 1;
      if (col >= s && col <= s + a[1].length) {
        const ad = def.attrs?.[a[1]];
        if (ad) return { contents: md(`**${a[1]}**: ${ad.doc}${ad.values ? `\n\nOne of: ${ad.values.map((v) => `\`${v}\``).join(', ')}` : ''}`) };
      }
    }
  }
  return null;
}

function validate(uri: string) {
  const text = docs.get(uri) ?? '';
  const lines = text.split('\n');
  const diagnostics = check(text).map((p) => {
    const l = Math.max(0, Math.min(lines.length - 1, p.line - 1));
    const first = lines[l].search(/\S/);
    return { range: { start: { line: l, character: Math.max(0, first) }, end: { line: l, character: lines[l].length } }, severity: 1, source: 'slides', message: p.message };
  });
  send({ method: 'textDocument/publishDiagnostics', params: { uri, diagnostics } });
}

function handle(msg: { id?: number; method?: string; params?: any }) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      send({ id, result: { capabilities: { textDocumentSync: 1, hoverProvider: true, completionProvider: { triggerCharacters: ['<', ' ', '=', '"', '/'] } }, serverInfo: { name: 'slides' } } });
      break;
    case 'shutdown': send({ id, result: null }); break;
    case 'exit': process.exit(0); break;
    case 'textDocument/didOpen':
      docs.set(params.textDocument.uri, params.textDocument.text);
      validate(params.textDocument.uri);
      break;
    case 'textDocument/didChange':
      docs.set(params.textDocument.uri, params.contentChanges[params.contentChanges.length - 1].text);
      validate(params.textDocument.uri);
      break;
    case 'textDocument/didClose':
      docs.delete(params.textDocument.uri);
      send({ method: 'textDocument/publishDiagnostics', params: { uri: params.textDocument.uri, diagnostics: [] } });
      break;
    case 'textDocument/completion':
      send({ id, result: { isIncomplete: false, items: complete(docs.get(params.textDocument.uri) ?? '', params.position) } });
      break;
    case 'textDocument/hover':
      send({ id, result: hover(docs.get(params.textDocument.uri) ?? '', params.position) });
      break;
    default:
      if (id !== undefined) send({ id, result: null }); // requests we do not know: an empty answer
  }
}

export function serve() {
  let buf = Buffer.alloc(0);
  process.stdin.on('data', (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const sep = buf.indexOf('\r\n\r\n');
      if (sep < 0) return;
      const len = /Content-Length: (\d+)/i.exec(buf.subarray(0, sep).toString())?.[1];
      if (!len) { buf = buf.subarray(sep + 4); continue; }
      const end = sep + 4 + Number(len);
      if (buf.length < end) return;
      const msg = JSON.parse(buf.subarray(sep + 4, end).toString());
      buf = buf.subarray(end);
      try { handle(msg); } catch (e) { if (msg.id !== undefined) send({ id: msg.id, error: { code: -32603, message: String(e) } }); }
    }
  });
  process.stdin.on('end', () => process.exit(0));
}
