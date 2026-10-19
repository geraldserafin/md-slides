#!/usr/bin/env node
// slides -- a markdown -> presentation compiler.
//   slides build <deck...> [-o out] [--target static|single|pdf|exe] [--steps] [--base /sciezka/]
//   slides dev   <deck...> [--port N] [--open]
// A deck = a folder of .md files (+ deck.json, images, videos...). See README.md.
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createLogger, createServer } from 'vite';
import { stageDecks } from './decks.mjs';
import tags from '../src/tags.json' with { type: 'json' };

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['static', 'single', 'pdf', 'exe'];

const USAGE = `slides build <deck...> [-o out] [--target static|single|pdf|exe] [--steps] [--base /path/]
slides dev   <deck...> [--port N] [--open]

  <deck> is a folder of .md files, or a folder of such folders (each one becomes a deck).

  static  static website (a folder; GitHub Pages etc.)         default -o dist
  single  one .html file, everything inline, works offline     default -o <deck>.html
  pdf     PDF (a page per slide; --steps = a page per step)    default -o <deck>.pdf
  exe     standalone executable for the current platform       default -o <deck>`;

function parseArgs(argv) {
  const o = { decks: [], target: 'static', steps: false, open: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') o.out = argv[++i];
    else if (a === '-t' || a === '--target') o.target = argv[++i];
    else if (a === '--base') o.base = argv[++i];
    else if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--steps') o.steps = true;
    else if (a === '--open') o.open = true;
    else if (a.startsWith('-')) throw new Error(`unknown option: ${a}`);
    else o.decks.push(a);
  }
  return o;
}

/** languages used in the decks' fences (to drop unused grammars from the single target) */
function usedLanguages(dirs) {
  const used = new Set();
  for (const d of dirs)
    for (const f of readdirSync(d).filter((f) => f.endsWith('.md')))
      for (const m of readFileSync(join(d, f), 'utf8').matchAll(/^[ \t]*(?:`{3,}|~{3,})[ \t]*(.*)$/gm))
        for (const w of m[1].trim().split(/\s+/)) if (tags[w.toLowerCase()]) used.add(tags[w.toLowerCase()]);
  return used;
}

function quietLogger() {
  const l = createLogger('warn');
  const warn = l.warn;
  l.warn = (m, o) => { if (!/externalized|inlineDynamicImports/.test(m)) warn(m, o); };
  return l;
}

/** A folder with .md files is a deck; a folder of such folders expands to its decks. */
function expandDecks(args) {
  const hasMd = (d) => existsSync(d) && readdirSync(d).some((f) => f.endsWith('.md'));
  return args.flatMap((a) => {
    const dir = resolve(a);
    if (!existsSync(dir)) throw new Error(`deck folder not found: ${a}`);
    if (hasMd(dir)) return [dir];
    const subs = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && hasMd(join(dir, e.name))).map((e) => join(dir, e.name)).sort();
    if (!subs.length) throw new Error(`no .md files in: ${a}`);
    return subs;
  });
}

const tmp = () => mkdtempSync(join(tmpdir(), 'slides-'));

async function compile(dirs, outDir, extra = {}) {
  const publicDir = tmp();
  stageDecks(dirs, publicDir);
  await build({
    root: rootDir, configFile: join(rootDir, 'vite.config.ts'), logLevel: 'warn', customLogger: quietLogger(), publicDir,
    build: {
      outDir, emptyOutDir: true, ...extra.build,
      rollupOptions: { ...extra.build?.rollupOptions, onwarn: (w, h) => w.code !== 'EVAL' && h(w) },
    }, ...extra.top,
  });
  rmSync(publicDir, { recursive: true, force: true });
}

async function cmdBuild(o) {
  if (!o.decks.length) throw new Error(`give a deck folder\n${USAGE}`);
  if (!TARGETS.includes(o.target)) throw new Error(`unknown target: ${o.target}`);
  const dirs = expandDecks(o.decks);
  const name = basename(dirs[0]);
  const base = o.base ?? './';

  if (o.target === 'static') {
    const out = resolve(o.out ?? 'dist');
    await compile(dirs, out, { top: { base } });
    console.log(`static -> ${out}`);
    return;
  }
  const work = tmp();
  try {
    if (o.target === 'single') {
      const out = resolve(o.out ?? `${name}.html`);
      await compile(dirs, work, {
        build: {
          assetsInlineLimit: (f) => (f.endsWith('.wasm') ? false : true),
          cssCodeSplit: false, modulePreload: false,
          rollupOptions: { output: { codeSplitting: false } },
        },
      });
      const { inlineDist } = await import('./single.mjs');
      const n = inlineDist(work, out, usedLanguages(dirs), new Set(Object.values(tags)));
      console.log(`single -> ${out} (${(statSync(out).size / 1048576).toFixed(1)} MB, ${n} files embedded)`);
    } else if (o.target === 'pdf') {
      await compile(dirs, work);
      const { exportPdfs } = await import('./pdf.mjs');
      const decks = dirs.map((d) => basename(d));
      let jobs;
      if (decks.length === 1) jobs = [{ deck: decks[0], out: resolve(o.out ?? `${decks[0]}.pdf`) }];
      else {
        const dir = resolve(o.out ?? '.');
        mkdirSync(dir, { recursive: true });
        jobs = decks.map((d) => ({ deck: d, out: join(dir, `${d}.pdf`) }));
      }
      await exportPdfs(work, jobs, o.steps);
      for (const j of jobs) console.log(`pdf -> ${j.out}`);
    } else {
      await compile(dirs, work);
      const { buildExe } = await import('./exe.mjs');
      const exe = await buildExe(work, resolve(o.out ?? name));
      console.log(`exe -> ${exe} (${(statSync(exe).size / 1048576).toFixed(0)} MB; run it with no arguments, --port N, --no-open)`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** the editor's backend: PUT /__slides/file?deck=<name>&file=<name.md|deck.json> writes into the deck folder */
function saveEndpoint(req, res, dirs, mark) {
  const url = new URL(req.url, 'http://x');
  const reply = (code, body = '') => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
  if (url.pathname === '/ping') return reply(200, { edit: true });
  if (url.pathname !== '/file' || req.method !== 'PUT') return reply(404, { error: 'not found' });
  const dir = dirs.find((d) => basename(d) === url.searchParams.get('deck'));
  const file = url.searchParams.get('file') ?? '';
  if (!dir || !/^[^/\\.][^/\\]*\.(md|json)$/.test(file)) return reply(400, { error: 'bad deck or file' });
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    try { mark(); writeFileSync(join(dir, file), Buffer.concat(chunks)); reply(200, { ok: true }); }
    catch (e) { reply(500, { error: String(e.message ?? e) }); }
  });
}

async function cmdDev(o) {
  if (!o.decks.length) throw new Error(`give a deck folder\n${USAGE}`);
  const dirs = expandDecks(o.decks);
  const publicDir = tmp();
  stageDecks(dirs, publicDir);
  let editorWrite = 0; // the editor's own saves must not reload the page it lives in
  const server = await createServer({
    root: rootDir, configFile: join(rootDir, 'vite.config.ts'), publicDir,
    server: { port: o.port, open: o.open, fs: { allow: [rootDir, ...dirs] } },
    plugins: [{
      name: 'slides-editor',
      configureServer(s) { s.middlewares.use('/__slides', (req, res) => saveEndpoint(req, res, dirs, () => (editorWrite = Date.now()))); },
    }],
  });
  await server.listen();
  server.printUrls();
  // a change in a deck folder => restage and reload the page
  let timer;
  for (const d of dirs)
    if (existsSync(d))
      watch(d, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          try { stageDecks(dirs, publicDir); if (Date.now() - editorWrite > 1500) server.ws.send({ type: 'full-reload' }); } catch (e) { console.error(String(e.message ?? e)); }
        }, 150);
      });
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'build') await cmdBuild(parseArgs(rest));
  else if (cmd === 'dev') await cmdDev(parseArgs(rest));
  else { console.log(USAGE); process.exit(cmd && cmd !== '--help' && cmd !== '-h' ? 1 : 0); }
} catch (e) {
  console.error(`slides: ${e.message ?? e}`);
  process.exit(1);
}
