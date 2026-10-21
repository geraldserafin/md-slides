// The language server of the .slides language: diagnostics (check.ts), completion and hover (schema.ts), outline, folding and
// "go to the code block with this id", over stdio. A hand-written JSON-RPC loop, so the package needs no dependency for it.
// `slides lsp` runs it, and any editor with an LSP client can use it.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check, layoutsOf } from './check.ts';
import { parseKdl, type KNode } from './kdl.ts';
import { pluginTags } from './plugin-schema.ts';
import { childrenOf, extendSchema, LAYOUTS, NODES, PART_NODES } from './schema.ts';

interface Pos { line: number; character: number }

const docs = new Map<string, string>();

/** the nodes of the plugins of the deck a file belongs to (read once per folder) */
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

/** where the cursor is, read from the text before it (the file may well be unparsable while it is being typed) */
export interface Ctx {
  /** the nodes whose `{` is open at the cursor, with their own statement (`slide layout=two-cols`), innermost last */
  stack: { name: string; head: string }[];
  /** the statement being typed: from the start of the node to the cursor, strings blanked out */
  stmt: string;
  inString: boolean;
}

const nameOf = (stmt: string) => /^\s*(?:\/-\s*)?([^\s"=;{}()]+)/.exec(stmt)?.[1] ?? '';

export function scan(text: string, off: number): Ctx {
  const stack: Ctx['stack'] = [];
  let stmt = '';
  let i = 0;
  while (i < off) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      const e = text.indexOf('\n', i);
      if (e < 0 || e >= off) return { stack, stmt, inString: true }; // in a comment: nothing to complete
      i = e;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2);
      if (e < 0 || e + 2 > off) return { stack, stmt, inString: true };
      i = e + 2;
      continue;
    }
    if (c === '"' || (c === '#' && /^#+"/.test(text.slice(i, i + 12)))) {
      const hashes = /^#*/.exec(text.slice(i))![0].length;
      const q = i + hashes;
      const multi = text.startsWith('"""', q);
      const close = `${multi ? '"""' : '"'}${'#'.repeat(hashes)}`;
      let j = q + (multi ? 3 : 1);
      for (;;) {
        const e = text.indexOf(close, j);
        if (e < 0 || e >= off) return { stack, stmt, inString: true };
        if (!hashes && text[e - 1] === '\\' && text[e - 2] !== '\\') { j = e + 1; continue; }
        i = e + close.length;
        break;
      }
      stmt += '"s"';
      continue;
    }
    if (c === '{') { stack.push({ name: nameOf(stmt), head: stmt }); stmt = ''; }
    else if (c === '}') { stack.pop(); stmt = ''; }
    else if (c === ';' || c === '\n') stmt = '';
    else stmt += c;
    i++;
  }
  return { stack, stmt, inString: false };
}

const md = (value: string) => ({ kind: 'markdown', value });
const own = (text: string) => layoutsOf(text);

/** the node names allowed where the cursor is */
function allowedHere(ctx: Ctx, text: string): string[] {
  const top = ctx.stack.at(-1);
  if (!top) return ['deck', 'slide', 'layout'];
  if (top.name === 'slide') {
    const layout = /\blayout=["#]*([\w-]+)/.exec(top.head)?.[1];
    const slots = layout ? own(text)[layout] ?? LAYOUTS[layout]?.slots ?? [] : [...new Set([...Object.values(own(text)).flat(), 'left', 'middle', 'right'])];
    return [...PART_NODES, ...slots];
  }
  if (top.name === 'layout') return ['row', 'col', 'grid', 'slot'];
  if (['row', 'col', 'grid'].includes(top.name) && ctx.stack.some((s) => s.name === 'layout')) return ['row', 'col', 'grid', 'slot'];
  if (!NODES[top.name]) return PART_NODES; // a slot of a layout
  return childrenOf(top.name);
}

/** a node as a completion: with its arguments and braces as a snippet */
function nodeItem(name: string) {
  const def = NODES[name];
  const first = def?.args?.find((a) => !a.optional);
  let snippet = name;
  if (name === 'code') snippet = 'code "${1:ts}" {\n  frame #"""\n    $0\n  """#\n}';
  else if (name === 'list') snippet = 'list {\n  - "$0"\n}';
  else if (name === 'table') snippet = 'table {\n  head "$1" "$2"\n  - "$3" "$4"\n}';
  else if (name === 'chart') snippet = 'chart "${1:bar}" #"""\n  $0\n  """#';
  else if (name === 'diagram' || name === 'math' || name === 'notes') snippet = `${name} #"""\n  $0\n  """#`;
  else if (name === 'frame') snippet = 'frame #"""\n  $0\n  """#';
  else if (name === '-') snippet = '- "$0"';
  else if (name === 'slide' || name === 'layout' || (def?.children && !first)) snippet = `${name}${name === 'layout' ? ' "${1:name}"' : ''} {\n  $0\n}`;
  else if (first) snippet = `${name} "\${1:${first.name}}"`;
  else if (!def) snippet = `${name} {\n  $0\n}`; // a slot
  return {
    label: name, kind: 14, detail: def?.args?.length ? `${name} ${def.args.map((a) => (a.optional ? `[${a.name}]` : a.name)).join(' ')}` : name,
    documentation: md(def?.doc ?? 'A slot of the layout.'), insertText: snippet, insertTextFormat: 2,
  };
}

function complete(text: string, p: Pos) {
  const off = offsetAt(text, p);
  const ctx = scan(text, off);
  if (ctx.inString) return [];
  const m = /^\s*(?:\/-\s*)?([^\s"=;{}()]*)$/.exec(ctx.stmt);
  if (m) return allowedHere(ctx, text).map(nodeItem);
  const name = nameOf(ctx.stmt);
  const def = NODES[name] ?? (name === 'slot' ? NODES.slot : undefined);
  if (!def) return [];
  // a property value: key=va|
  const val = /(?:^|\s)([\w-]+)=([^\s"]*)$/.exec(ctx.stmt);
  if (val) {
    if (val[1] === 'layout' && name === 'slide') return [...Object.keys(LAYOUTS), ...Object.keys(own(text))].map((v) => ({ label: v, kind: 12, documentation: md(LAYOUTS[v]?.doc ?? 'An own layout.') }));
    const values = def.props?.[val[1]]?.values ?? [];
    return values.map((v) => ({ label: v, kind: 12 }));
  }
  // a property or a flag
  const have = new Set([...ctx.stmt.matchAll(/(?:^|\s)([\w-]+)(?==|\s|$)/g)].map((x) => x[1]));
  return [
    ...Object.entries(def.props ?? {}).filter(([k]) => !have.has(k)).map(([k, d]) => ({
      label: k, kind: 5, detail: d.values?.join(' | ') ?? (d.type === 'number' ? 'number' : undefined), documentation: md(d.doc), insertText: `${k}=`,
      sortText: k === 'anim' || k === 'id' ? `z${k}` : k,
    })),
    ...Object.entries(def.flags ?? {}).filter(([k]) => !have.has(k)).map(([k, d]) => ({ label: k, kind: 12, detail: 'flag', documentation: md(d) })),
  ];
}

function hover(text: string, p: Pos) {
  const off = offsetAt(text, p);
  const ls = text.lastIndexOf('\n', off - 1) + 1;
  const le = text.indexOf('\n', off) < 0 ? text.length : text.indexOf('\n', off);
  const line = text.slice(ls, le);
  const col = off - ls;
  if (scan(text, ls).inString) return null;
  // the word under the cursor
  const left = /[\w-]*$/.exec(line.slice(0, col))![0];
  const word = left + /^[\w-]*/.exec(line.slice(col))![0];
  if (!word) return null;
  const before = line.slice(0, col - left.length);
  if ((before.match(/(?<!\\)"/g) ?? []).length % 2) return null; // inside a string
  const after = line.slice(col - left.length + word.length);
  if (/(^|[{};])\s*(?:\/-\s*)?$/.test(before)) {
    // a node name
    const def = NODES[word];
    if (!def) return null;
    const props = Object.entries(def.props ?? {}).map(([k, a]) => `- \`${k}\`: ${a.doc}`).join('\n');
    const flags = Object.entries(def.flags ?? {}).map(([k, d]) => `- \`${k}\` (flag): ${d}`).join('\n');
    return { contents: md(`**${word}**: ${def.doc}${props ? `\n\n${props}` : ''}${flags ? `\n\n${flags}` : ''}`) };
  }
  const stmt = before.slice(Math.max(before.lastIndexOf('{'), before.lastIndexOf(';'), before.lastIndexOf('}')) + 1);
  const def = NODES[nameOf(stmt)];
  if (!def) return null;
  const prop = after.startsWith('=') ? def.props?.[word] : undefined;
  if (prop) return { contents: md(`**${word}**: ${prop.doc}${prop.values ? `\n\nOne of: ${prop.values.map((v) => `\`${v}\``).join(', ')}` : ''}`) };
  if (def.flags?.[word]) return { contents: md(`**${word}**: ${def.flags[word]}`) };
  if (word in LAYOUTS && /layout=\S*$/.test(before)) return { contents: md(`**${word}**: ${LAYOUTS[word].doc}`) };
  return null;
}

interface Sym { name: string; kind: number; range: { start: Pos; end: Pos }; selectionRange: { start: Pos; end: Pos }; children: Sym[] }

const SYMBOL_KIND: Record<string, number> = { deck: 3, slide: 2, layout: 11, row: 23, col: 23, grid: 23, step: 24, code: 5, title: 15, heading: 15, chart: 5, diagram: 5 };

/** the structure of a file: slides, layouts, rows, columns, steps, code blocks and headings, as a tree with ranges (outline and folding) */
export function outline(text: string): Sym[] {
  let nodes: KNode[];
  try { nodes = parseKdl(text); } catch { return []; }
  const lines = text.split('\n');
  let slideNo = 0;
  const conv = (n: KNode, inSlide: boolean): Sym | undefined => {
    if (!SYMBOL_KIND[n.name]) return undefined;
    const first = n.children.find((c) => c.name === 'title' || c.name === 'heading');
    let name: string = n.name;
    if (n.name === 'slide') name = `${++slideNo}. ${n.props.title ?? (first?.args[0] ? String(first.args[0]) : 'slide')}`;
    else if (n.name === 'title' || n.name === 'heading') name = String(n.args[0] ?? n.name);
    else if (n.name === 'layout') name = `layout ${n.args[0] ?? ''}`.trim();
    else if (n.name === 'code') name = [n.name, typeof n.args[0] === 'string' ? n.args[0] : '', n.props.id !== undefined ? `#${n.props.id}` : ''].filter(Boolean).join(' ');
    const l0 = n.line - 1;
    const l1 = Math.max(l0, n.endLine - 1);
    const range = { start: { line: l0, character: n.col - 1 }, end: { line: l1, character: lines[l1]?.length ?? 0 } };
    return { name, kind: SYMBOL_KIND[n.name], range, selectionRange: { start: range.start, end: { line: l0, character: lines[l0]?.length ?? 0 } }, children: n.children.map((c) => conv(c, inSlide || n.name === 'slide')).filter((x): x is Sym => !!x) };
  };
  return nodes.map((n) => conv(n, false)).filter((x): x is Sym => !!x);
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
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.slides')).sort()) {
    const fileUri = pathToFileURL(join(dir, f)).href;
    const src = fileUri === uri ? text : readFileSync(join(dir, f), 'utf8');
    src.split('\n').forEach((l, i) => {
      const m = new RegExp(`\\bcode\\b[^\\n]*\\bid=["']?${hit[1]}(?![\\w-])`).exec(l);
      if (m && !(fileUri === uri && i === p.line)) out.push({ uri: fileUri, range: { start: { line: i, character: m.index }, end: { line: i, character: l.length } } });
    });
  }
  return out;
}

/** the own layouts of the other files of the deck */
function siblingLayouts(uri: string): Record<string, string[]> {
  if (!uri.startsWith('file:')) return {};
  const file = fileURLToPath(uri);
  const dir = dirname(file);
  try {
    return Object.assign({}, ...readdirSync(dir).filter((f) => f.endsWith('.slides') && join(dir, f) !== file).map((f) => layoutsOf(readFileSync(join(dir, f), 'utf8'))));
  } catch {
    return {};
  }
}

/** the number of the slide (0-based, in the whole deck folder) that holds a line of a file: for the preview to follow the cursor */
function slideIndex(uri: string, line: number): number {
  const count = (text: string) => { try { return parseKdl(text).filter((n) => n.name === 'slide'); } catch { return []; } };
  let base = 0;
  if (uri.startsWith('file:')) {
    const file = fileURLToPath(uri);
    const dir = dirname(file);
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.slides')).sort()) {
      if (join(dir, f) === file) break;
      base += count(readFileSync(join(dir, f), 'utf8')).length;
    }
  }
  const here = count(docs.get(uri) ?? '');
  let idx = 0;
  here.forEach((n, i) => { if (n.line - 1 <= line) idx = i; });
  return base + idx;
}

function validate(uri: string) {
  const text = docs.get(uri) ?? '';
  const lines = text.split('\n');
  const diagnostics = check(text, siblingLayouts(uri)).map((p) => {
    const l = Math.max(0, Math.min(lines.length - 1, p.line - 1));
    return { range: { start: { line: l, character: Math.max(0, p.col - 1) }, end: { line: l, character: lines[l].length } }, severity: 1, source: 'slides', message: p.message };
  });
  send({ method: 'textDocument/publishDiagnostics', params: { uri, diagnostics } });
}

function handle(msg: { id?: number; method?: string; params?: any }) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      send({ id, result: { capabilities: { textDocumentSync: 1, hoverProvider: true, documentSymbolProvider: true, foldingRangeProvider: true, definitionProvider: true, completionProvider: { triggerCharacters: [' ', '=', '/'] } }, serverInfo: { name: 'slides' } } });
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
      send({ id, result: flatten(outline(docs.get(params.textDocument.uri) ?? '')).filter((s) => s.range.end.line > s.range.start.line + 1).map((s) => ({ startLine: s.range.start.line, endLine: s.range.end.line - 1 })) });
      break;
    case 'slides/slideIndex':
      send({ id, result: slideIndex(params.uri, params.line) });
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

