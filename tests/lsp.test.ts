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
  const uri = 'file:///t/a.slides';
  const complete = (u: string, line: number, character: number) => request('textDocument/completion', { textDocument: { uri: u }, position: { line, character } });
  const labels = (r: any) => r.items.map((i: any) => i.label);

  it('initializes with completion, hover and diagnostics', async () => {
    const r = await request('initialize', { capabilities: {} });
    expect(r.capabilities).toMatchObject({ hoverProvider: true, textDocumentSync: 1 });
  });
  it('publishes diagnostics with the line', async () => {
    open(uri, 'slide {\n  titel "a"\n}\n');
    const m = await until((x) => x.method === 'textDocument/publishDiagnostics' && x.params.uri === uri && x.params.diagnostics.length > 0);
    expect(m.params.diagnostics[0]).toMatchObject({ message: 'unknown node `titel` (did you mean `title`?)', range: { start: { line: 1 } } });
  });
  it('completes node names by where the cursor is', async () => {
    open('file:///t/b.slides', 'slide {\n  row {\n    \n  }\n}');
    const inRow = labels(await complete('file:///t/b.slides', 2, 4));
    expect(inRow).toContain('code');
    expect(inRow).not.toContain('frame');
    open('file:///t/c.slides', 'slide {\n  list {\n    \n  }\n}');
    expect(labels(await complete('file:///t/c.slides', 2, 4))).toEqual(['-']);
    open('file:///t/c2.slides', '\n');
    expect(labels(await complete('file:///t/c2.slides', 0, 0))).toEqual(['deck', 'slide', 'layout']);
  });
  it('completes properties, flags and values', async () => {
    open('file:///t/d.slides', 'slide {\n  video "a.mp4" \n  text "x" anim=\n}');
    const r = await complete('file:///t/d.slides', 1, 16);
    expect(labels(r)).toContain('autoplay');
    expect(r.items.find((i: any) => i.label === 'width').insertText).toBe('width=');
    expect(labels(await complete('file:///t/d.slides', 2, 16))).toContain('zoom');
    open('file:///t/d2.slides', 'slide layout=');
    expect(labels(await complete('file:///t/d2.slides', 0, 13))).toContain('two-cols');
  });
  it('does not complete inside a string or a comment', async () => {
    open('file:///t/s.slides', 'slide {\n  text "a b \n}\n');
    expect(labels(await complete('file:///t/s.slides', 1, 10))).toEqual([]);
    open('file:///t/s2.slides', 'slide {\n  // a comment\n}');
    expect(labels(await complete('file:///t/s2.slides', 1, 8))).toEqual([]);
  });
  it('offers the slots of the layout of the slide', async () => {
    open('file:///t/l.slides', 'slide layout=two-cols {\n  \n}');
    expect(labels(await complete('file:///t/l.slides', 1, 2))).toEqual(expect.arrayContaining(['left', 'right', 'title']));
    open('file:///t/l2.slides', 'layout "side" { row { slot "nav"; slot } }\nslide layout=side {\n  \n}');
    expect(labels(await complete('file:///t/l2.slides', 2, 2))).toContain('nav');
  });
  it('knows the nodes of the plugins of the deck a file belongs to', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-lsp-'));
    writeFileSync(join(dir, 'deck.json'), JSON.stringify({ plugins: ['./p.js'] }));
    writeFileSync(join(dir, 'p.js'), "export default { tags: { sparkle: { doc: 'Sparkles.' } } };");
    const u = pathToFileURL(join(dir, 'a.slides')).href;
    open(u, 'slide {\n  sparkle\n  \n}');
    const diag = await until((x) => x.method === 'textDocument/publishDiagnostics' && x.params.uri === u);
    expect(diag.params.diagnostics.map((d: any) => d.message).join()).not.toMatch(/unknown node `sparkle`/);
    expect(labels(await complete(u, 2, 2))).toContain('sparkle');
  });
  it('hovers a node, a property and a flag', async () => {
    open('file:///t/g.slides', 'slide {\n  code "ts" id=x loop {\n  }\n}');
    const hov = (line: number, character: number) => request('textDocument/hover', { textDocument: { uri: 'file:///t/g.slides' }, position: { line, character } });
    expect((await hov(1, 4)).contents.value).toMatch(/One animated code block/);
    expect((await hov(1, 13)).contents.value).toMatch(/morph id/);
    expect((await hov(1, 20)).contents.value).toMatch(/forth and back/);
    expect(await hov(1, 10)).toBeNull(); // inside the string
  });
  it('outlines the structure and folds it', async () => {
    const src = 'slide {\n  title "Intro"\n  row {\n    text "a"\n    code "ts" id=x {\n      frame "let a;"\n    }\n  }\n}\nslide {\n  title "Two"\n}';
    open('file:///t/i.slides', src);
    const syms = await request('textDocument/documentSymbol', { textDocument: { uri: 'file:///t/i.slides' } });
    expect(syms.map((s: any) => s.name)).toEqual(['1. Intro', '2. Two']);
    expect(syms[0].children.map((s: any) => s.name)).toEqual(['Intro', 'row']);
    expect(syms[0].children[1].children.map((s: any) => s.name)).toEqual(['code ts #x']);
    const folds = await request('textDocument/foldingRange', { textDocument: { uri: 'file:///t/i.slides' } });
    expect(folds).toContainEqual({ startLine: 0, endLine: 7 });
    expect(folds).toContainEqual({ startLine: 2, endLine: 6 });
  });
  it('numbers the slides of a deck folder for the preview to follow the cursor', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-idx-'));
    writeFileSync(join(dir, '01.slides'), 'slide { title "a" }\nslide { title "b" }');
    const u = pathToFileURL(join(dir, '02.slides')).href;
    open(u, 'slide {\n  title "c"\n}\nslide {\n  title "d"\n}');
    expect(await request('slides/slideIndex', { uri: u, line: 1 })).toBe(2);
    expect(await request('slides/slideIndex', { uri: u, line: 4 })).toBe(3);
  });
  it('goes from a code id to the blocks that share it, in the files of the deck', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-def-'));
    writeFileSync(join(dir, '01.slides'), 'slide { code "ts" "a;" id=cart }');
    writeFileSync(join(dir, '02.slides'), 'slide { code "ts" "b;" id=cart }\nslide { code from=cart }');
    const u = pathToFileURL(join(dir, '02.slides')).href;
    open(u, 'slide { code "ts" "b;" id=cart }\nslide { code from=cart }');
    const r = await request('textDocument/definition', { textDocument: { uri: u }, position: { line: 1, character: 22 } });
    expect(r.map((x: any) => x.uri.split('/').pop() + ':' + x.range.start.line)).toEqual(['01.slides:0', '02.slides:0']);
  });
});
