import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// talks to `slides lsp` over stdio like an editor does
const proc = spawn(process.execPath, ['cli/slideit.mjs', 'lsp'], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = Buffer.alloc(0);
const waiting: ((m: any) => boolean)[] = [];
const seen: any[] = [];
proc.stdout.on('data', (d: Buffer) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    const sep = buf.indexOf('\r\n\r\n');
    if (sep < 0) return;
    const len = Number(/Content-Length: (\d+)/.exec(buf.subarray(0, sep).toString())![1]);
    if (buf.length < sep + 4 + len) return;
    const msg = JSON.parse(buf.subarray(sep + 4, sep + 4 + len).toString());
    buf = buf.subarray(sep + 4 + len);
    seen.push(msg);
    for (const w of [...waiting]) if (w(msg)) waiting.splice(waiting.indexOf(w), 1);
  }
});
const write = (msg: object) => { const b = JSON.stringify({ jsonrpc: '2.0', ...msg }); proc.stdin.write(`Content-Length: ${Buffer.byteLength(b)}\r\n\r\n${b}`); };
const until = (pred: (m: any) => boolean) => new Promise<any>((ok) => { const hit = seen.find(pred); if (hit) ok(hit); else waiting.push((m) => (pred(m) ? (ok(m), true) : false)); });
let id = 0;
const request = async (method: string, params: object) => { const i = ++id; write({ id: i, method, params }); return (await until((m) => m.id === i)).result; };
const open = (uri: string, text: string) => write({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'slide', version: 1, text } } });

afterAll(() => { proc.kill(); });

describe('slides lsp', () => {
  const uri = 'file:///t/a.slide';
  it('initializes with completion, hover and diagnostics', async () => {
    const r = await request('initialize', { capabilities: {} });
    expect(r.capabilities).toMatchObject({ hoverProvider: true, textDocumentSync: 1 });
  });
  it('publishes diagnostics with the line', async () => {
    open(uri, '<p>a</p>\n<div>x</div>\n');
    const m = await until((x) => x.method === 'textDocument/publishDiagnostics' && x.params.uri === uri && x.params.diagnostics.length > 0);
    expect(m.params.diagnostics[0]).toMatchObject({ message: 'unknown tag <div>', range: { start: { line: 1 } } });
  });
  it('completes tag names inside a row, and not text tags inside a ul', async () => {
    open('file:///t/b.slide', '<row>\n  <\n</row>');
    const r = await request('textDocument/completion', { textDocument: { uri: 'file:///t/b.slide' }, position: { line: 1, character: 3 } });
    const labels = r.items.map((i: any) => i.label);
    expect(labels).toContain('code');
    expect(labels).not.toContain('li');
    open('file:///t/c.slide', '<ul>\n  <\n</ul>');
    const r2 = await request('textDocument/completion', { textDocument: { uri: 'file:///t/c.slide' }, position: { line: 1, character: 3 } });
    expect(r2.items.map((i: any) => i.label)).toEqual(['li']);
  });
  it('completes attributes and values', async () => {
    open('file:///t/d.slide', '<code la');
    let r = await request('textDocument/completion', { textDocument: { uri: 'file:///t/d.slide' }, position: { line: 0, character: 8 } });
    expect(r.items.map((i: any) => i.label)).toContain('lang');
    open('file:///t/e.slide', '<p anim=');
    r = await request('textDocument/completion', { textDocument: { uri: 'file:///t/e.slide' }, position: { line: 0, character: 8 } });
    expect(r.items.map((i: any) => i.label)).toContain('zoom');
  });
  it('closes the innermost open tag after </', async () => {
    open('file:///t/f.slide', '<row>\n<col>\n</');
    const r = await request('textDocument/completion', { textDocument: { uri: 'file:///t/f.slide' }, position: { line: 2, character: 2 } });
    expect(r.items.map((i: any) => i.label)).toEqual(['col']);
  });
  it('knows the tags of the plugins of the deck a file belongs to', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-lsp-'));
    writeFileSync(join(dir, 'deck.json'), JSON.stringify({ plugins: ['./p.js'] }));
    writeFileSync(join(dir, 'p.js'), "export default { tags: { sparkle: { doc: 'Sparkles.', empty: true } } };");
    const uri = pathToFileURL(join(dir, 'a.slide')).href;
    open(uri, '<sparkle />\n<');
    const diag = await until((x) => x.method === 'textDocument/publishDiagnostics' && x.params.uri === uri);
    expect(diag.params.diagnostics.map((d: any) => d.message).join()).not.toMatch(/unknown tag <sparkle>/);
    const r = await request('textDocument/completion', { textDocument: { uri }, position: { line: 1, character: 1 } });
    expect(r.items.map((i: any) => i.label)).toContain('sparkle');
  });
  it('completes the keys and values of a <slide> block', async () => {
    open('file:///t/h.slide', '<slide>\n  th\n  halign: \n</slide>');
    const keys = await request('textDocument/completion', { textDocument: { uri: 'file:///t/h.slide' }, position: { line: 1, character: 4 } });
    expect(keys.items.map((i: any) => i.label)).toContain('theme');
    const vals = await request('textDocument/completion', { textDocument: { uri: 'file:///t/h.slide' }, position: { line: 2, character: 10 } });
    expect(vals.items.map((i: any) => i.label)).toEqual(['start', 'center', 'end']);
    const hov = await request('textDocument/hover', { textDocument: { uri: 'file:///t/h.slide' }, position: { line: 2, character: 4 } });
    expect(hov.contents.value).toMatch(/horizontally/);
  });
  it('outlines the structure and folds it', async () => {
    const src = '<h2>Title</h2>\n<section>\n  <row>\n    <p>a</p>\n    <code lang=ts id=x>\n      let a;\n    </code>\n  </row>\n</section>';
    open('file:///t/i.slide', src);
    const syms = await request('textDocument/documentSymbol', { textDocument: { uri: 'file:///t/i.slide' } });
    expect(syms.map((s: any) => s.name)).toEqual(['Title', 'section']);
    expect(syms[1].children[0].name).toBe('row');
    expect(syms[1].children[0].children.map((s: any) => s.name)).toEqual(['code ts #x']);
    const folds = await request('textDocument/foldingRange', { textDocument: { uri: 'file:///t/i.slide' } });
    expect(folds).toContainEqual({ startLine: 1, endLine: 7 });
    expect(folds).toContainEqual({ startLine: 4, endLine: 5 });
  });
  it('goes from a code id to the blocks that share it, in the files of the deck', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-def-'));
    writeFileSync(join(dir, '01.slide'), '<code lang=ts id=cart>a;</code>');
    writeFileSync(join(dir, '02.slide'), '<code lang=ts id=cart>b;</code>\n<code lang=ts from=cart />');
    const uri = pathToFileURL(join(dir, '02.slide')).href;
    open(uri, '<code lang=ts id=cart>b;</code>\n<code lang=ts from=cart />');
    const r = await request('textDocument/definition', { textDocument: { uri }, position: { line: 1, character: 22 } });
    expect(r.map((x: any) => x.uri.split('/').pop() + ':' + x.range.start.line)).toEqual(['01.slide:0', '02.slide:0']);
  });
  it('hovers a tag and an attribute', async () => {
    open('file:///t/g.slide', '<code lang=ts>x</code>');
    const tag = await request('textDocument/hover', { textDocument: { uri: 'file:///t/g.slide' }, position: { line: 0, character: 3 } });
    expect(tag.contents.value).toMatch(/One animated code block/);
    const attr = await request('textDocument/hover', { textDocument: { uri: 'file:///t/g.slide' }, position: { line: 0, character: 8 } });
    expect(attr.contents.value).toMatch(/the language/);
  });
});
