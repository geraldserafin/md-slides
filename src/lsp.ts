// The language server of the slide markup: diagnostics (check.ts), completion and hover (schema.ts), over stdio.
// A hand-written JSON-RPC loop, so the package needs no dependency for it. Plain TypeScript, no framework: `slides lsp`
// runs it, and any editor with an LSP client can use it.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check } from './check.ts';
import { pluginTags } from './plugin-schema.ts';
import { childrenOf, extendSchema, FX, SLIDE_SETTINGS, TAGS } from './schema.ts';

interface Pos { line: number; character: number }

const docs = new Map<string, string>();

/** the tags of the plugins of the deck a file belongs to (read once per folder) */
const decks = new Map<string, Promise<void>>();
const withPlugins = (uri: string): Promise<void> => {
  if (!uri.startsWith('file:')) return Promise.resolve();
  const dir = dirname(fileURLToPath(uri));
  if (!decks.has(dir)) decks.set(dir, pluginTags(dir).then(extendSchema, () => {}));
  return decks.get(dir)!;
};

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
  // inside <slide>: `key: value` lines
  if (openTags(text, off).at(-1) === 'slide') {
    const val = /^\s*([\w-]+)\s*:\s*([^\s#]*)$/.exec(line);
    if (val) return (SLIDE_SETTINGS[val[1]]?.values ?? []).map((v) => ({ label: v, kind: 12 }));
    if (/^\s*[\w-]*$/.test(line)) return Object.entries(SLIDE_SETTINGS).map(([k, s]) => ({ label: k, kind: 10, documentation: md(s.doc), insertText: `${k}: `, detail: s.values?.join(' | ') }));
    return [];
  }
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
  if (openTags(text, off).at(-1) === 'slide') {
    const key = /^\s*([\w-]+)\s*:/.exec(text.slice(text.lastIndexOf('\n', off - 1) + 1, text.indexOf('\n', off) < 0 ? text.length : text.indexOf('\n', off)))?.[1];
    const s = key && SLIDE_SETTINGS[key];
    return s ? { contents: md(`**${key}**: ${s.doc}${s.values ? `\n\nOne of: ${s.values.map((v) => `\`${v}\``).join(', ')}` : ''}`) } : null;
  }
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

interface Sym { name: string; kind: number; range: { start: Pos; end: Pos }; selectionRange: { start: Pos; end: Pos }; children: Sym[] }

const SYMBOL_KIND: Record<string, number> = { section: 3, row: 23, col: 23, step: 24, code: 5, slide: 2, h1: 15, h2: 15, h3: 15, chart: 5, diagram: 5 };

/** the structure of a file: sections, rows, cols, steps, code blocks and headings, as a tree with ranges (outline and folding) */
export function outline(text: string): Sym[] {
  const roots: Sym[] = [];
  const stack: { name: string; sym?: Sym; start: Pos }[] = [];
  const lineOf = (i: number) => text.slice(0, i).split('\n').length - 1;
  const colOf = (i: number) => i - (text.lastIndexOf('\n', i - 1) + 1);
  const pos = (i: number): Pos => ({ line: lineOf(i), character: colOf(i) });
  const re = /<(\/?)([a-z][a-z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [all, close, name, attrs, self] = m;
    if (!TAGS[name]) continue;
    if (close) {
      const i = stack.map((s) => s.name).lastIndexOf(name);
      if (i < 0) continue;
      const [top] = stack.splice(i);
      if (top.sym) top.sym.range = { start: top.sym.range.start, end: pos(m.index + all.length) };
      continue;
    }
    let sym: Sym | undefined;
    if (SYMBOL_KIND[name]) {
      const lang = /\blang=["']?([\w+#.-]+)/.exec(attrs)?.[1];
      const id = /\bid=["']?([\w-]+)/.exec(attrs)?.[1];
      const head = /^h[1-3]$/.test(name) ? text.slice(re.lastIndex, text.indexOf('</', re.lastIndex)).replace(/<[^>]*>/g, '').trim() : '';
      const label = head || [name, lang, id && `#${id}`].filter(Boolean).join(' ');
      sym = { name: label || name, kind: SYMBOL_KIND[name], range: { start: pos(m.index), end: pos(m.index + all.length) }, selectionRange: { start: pos(m.index), end: pos(m.index + all.length) }, children: [] };
      (stack.map((s) => s.sym).filter(Boolean).at(-1)?.children ?? roots).push(sym);
    }
    if (self || TAGS[name].empty) { continue; }
    if (TAGS[name].raw) {
      const end = text.indexOf(`</${name}>`, re.lastIndex);
      if (end >= 0) {
        if (sym) sym.range = { start: sym.range.start, end: pos(end + name.length + 3) };
        re.lastIndex = end + name.length + 3;
      }
      continue;
    }
    stack.push({ name, sym, start: pos(m.index) });
  }
  return roots;
}

const flatten = (syms: Sym[]): Sym[] => syms.flatMap((s) => [s, ...flatten(s.children)]);

/** `id=name` / `from=name` under the cursor: the code blocks with that id in the files of the deck */
function definition(uri: string, text: string, p: Pos) {
  const off = offsetAt(text, p);
  const ls = text.lastIndexOf('\n', off - 1) + 1;
  const line = text.slice(ls, text.indexOf('\n', off) < 0 ? text.length : text.indexOf('\n', off));
  const hit = [...line.matchAll(/\b(?:id|from)=["']?([\w-]+)/g)].find((m) => off - ls >= m.index! && off - ls <= m.index! + m[0].length);
  if (!hit || !uri.startsWith('file:')) return [];
  const dir = dirname(fileURLToPath(uri));
  const out: { uri: string; range: { start: Pos; end: Pos } }[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.slide')).sort()) {
    const fileUri = pathToFileURL(join(dir, f)).href;
    const src = fileUri === uri ? text : readFileSync(join(dir, f), 'utf8');
    src.split('\n').forEach((l, i) => {
      const m = new RegExp(`<code\\b[^>]*\\bid=["']?${hit[1]}(?![\\w-])`).exec(l);
      if (m && !(fileUri === uri && i === p.line)) out.push({ uri: fileUri, range: { start: { line: i, character: m.index }, end: { line: i, character: l.length } } });
    });
  }
  return out;
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
      send({ id, result: { capabilities: { textDocumentSync: 1, hoverProvider: true, documentSymbolProvider: true, foldingRangeProvider: true, definitionProvider: true, completionProvider: { triggerCharacters: ['<', ' ', '=', '"', '/'] } }, serverInfo: { name: 'slides' } } });
      break;
    case 'shutdown': send({ id, result: null }); break;
    case 'exit': process.exit(0); break;
    case 'textDocument/didOpen':
      docs.set(params.textDocument.uri, params.textDocument.text);
      void withPlugins(params.textDocument.uri).then(() => validate(params.textDocument.uri));
      break;
    case 'textDocument/didChange':
      docs.set(params.textDocument.uri, params.contentChanges[params.contentChanges.length - 1].text);
      void withPlugins(params.textDocument.uri).then(() => validate(params.textDocument.uri));
      break;
    case 'textDocument/didClose':
      docs.delete(params.textDocument.uri);
      send({ method: 'textDocument/publishDiagnostics', params: { uri: params.textDocument.uri, diagnostics: [] } });
      break;
    case 'textDocument/completion':
      void withPlugins(params.textDocument.uri).then(() => send({ id, result: { isIncomplete: false, items: complete(docs.get(params.textDocument.uri) ?? '', params.position) } }));
      break;
    case 'textDocument/hover':
      void withPlugins(params.textDocument.uri).then(() => send({ id, result: hover(docs.get(params.textDocument.uri) ?? '', params.position) }));
      break;
    case 'textDocument/documentSymbol':
      send({ id, result: outline(docs.get(params.textDocument.uri) ?? '') });
      break;
    case 'textDocument/foldingRange':
      send({ id, result: flatten(outline(docs.get(params.textDocument.uri) ?? '')).filter((s) => s.range.end.line > s.range.start.line).map((s) => ({ startLine: s.range.start.line, endLine: s.range.end.line - 1 })) });
      break;
    case 'textDocument/definition':
      send({ id, result: definition(params.textDocument.uri, docs.get(params.textDocument.uri) ?? '', params.position) });
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
