#!/usr/bin/env node
// slides -- a .slide markup -> presentation compiler.
//   slides build <deck...> [-o out] [--target static|single|pdf|exe] [--steps] [--base /sciezka/]
//   slides dev   <deck...> [--port N] [--open]
//   slides new   <folder> [--title "My talk"]
//   slides check <deck...>     slides schema
// A deck = a folder of .slide files (+ deck.json, images, videos...). See README.md.
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch } from 'node:fs';
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
slides new   <folder> [--title "My talk"]       a starter deck to edit
slides check <deck...>                          find mistakes in the .slide files (file:line: message)
slides schema                                   the markup as JSON (tags, attributes), for editor tooling

  <deck> is a folder of .slide files, or a folder of such folders (each one becomes a deck).
  A folder of decks may hold a hub.json that customizes the deck chooser (title, subtitle, logo, theme...);
  for other layouts point at it with --hub <folder>.

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
    else if (a === '--hub') o.hub = argv[++i];
    else if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--title') o.title = argv[++i];
    else if (a === '--steps') o.steps = true;
    else if (a === '--open') o.open = true;
    else if (a.startsWith('-')) throw new Error(`unknown option: ${a}`);
    else o.decks.push(a);
  }
  return o;
}

/** does any deck use a <diagram> tag? (the diagram library is left out of the build otherwise) */
function usesMermaid(dirs) {
  return dirs.some((d) => readdirSync(d).some((f) => f.endsWith('.slide') && /<diagram[\s>]/.test(readFileSync(join(d, f), 'utf8'))));
}

/** languages used by the decks' <code> tags (to drop unused grammars from the single target) */
function usedLanguages(dirs) {
  const used = new Set();
  for (const d of dirs)
    for (const f of readdirSync(d).filter((f) => f.endsWith('.slide')))
      for (const m of readFileSync(join(d, f), 'utf8').matchAll(/<code\b[^>]*?\blang=["']?([\w+#.-]+)/g))
        if (tags[m[1].toLowerCase()]) used.add(tags[m[1].toLowerCase()]);
  return used;
}

function quietLogger() {
  const l = createLogger('warn');
  const warn = l.warn;
  l.warn = (m, o) => { if (!/externalized|inlineDynamicImports/.test(m)) warn(m, o); };
  return l;
}

/** the folder whose hub.json customizes the gallery: --hub, else the first given folder of decks that has one */
function hubFolder(args, hub) {
  if (hub) {
    const p = resolve(hub);
    return existsSync(p) && statSync(p).isFile() ? dirname(p) : p;
  }
  const hasMd = (d) => readdirSync(d).some((f) => f.endsWith('.slide'));
  return args.map((a) => resolve(a)).find((d) => existsSync(join(d, 'hub.json')) && !hasMd(d));
}

/** A folder with .slide files is a deck; a folder of such folders expands to its decks. */
function expandDecks(args) {
  const hasMd = (d) => existsSync(d) && readdirSync(d).some((f) => f.endsWith('.slide'));
  return args.flatMap((a) => {
    const dir = resolve(a);
    if (!existsSync(dir)) throw new Error(`deck folder not found: ${a}`);
    if (hasMd(dir)) return [dir];
    const subs = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && hasMd(join(dir, e.name))).map((e) => join(dir, e.name)).sort();
    if (!subs.length) throw new Error(`no .slide files in: ${a}`);
    return subs;
  });
}

const tmp = () => mkdtempSync(join(tmpdir(), 'slides-'));

async function compile(dirs, outDir, extra = {}, hubDir) {
  const publicDir = tmp();
  stageDecks(dirs, publicDir, hubDir);
  await build({
    root: rootDir, configFile: join(rootDir, 'vite.config.ts'), logLevel: 'warn', customLogger: quietLogger(), publicDir,
    build: {
      outDir, emptyOutDir: true, ...extra.build,
      rollupOptions: { ...extra.build?.rollupOptions, onwarn: (w, h) => w.code !== 'EVAL' && h(w) },
    }, define: { __USE_MERMAID__: String(usesMermaid(dirs)) }, ...extra.top,
  });
  rmSync(publicDir, { recursive: true, force: true });
}

async function cmdBuild(o) {
  if (!o.decks.length) throw new Error(`give a deck folder\n${USAGE}`);
  if (!TARGETS.includes(o.target)) throw new Error(`unknown target: ${o.target}`);
  const dirs = expandDecks(o.decks);
  const hubDir = hubFolder(o.decks, o.hub);
  const name = basename(dirs[0]);
  const base = o.base ?? './';

  if (o.target === 'static') {
    const out = resolve(o.out ?? 'dist');
    await compile(dirs, out, { top: { base } }, hubDir);
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
      }, hubDir);
      const { inlineDist } = await import('./single.mjs');
      const n = inlineDist(work, out, usedLanguages(dirs), new Set(Object.values(tags)));
      console.log(`single -> ${out} (${(statSync(out).size / 1048576).toFixed(1)} MB, ${n} files embedded)`);
    } else if (o.target === 'pdf') {
      await compile(dirs, work, {}, hubDir);
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
      await compile(dirs, work, {}, hubDir);
      const { buildExe } = await import('./exe.mjs');
      const exe = await buildExe(work, resolve(o.out ?? name));
      console.log(`exe -> ${exe} (${(statSync(exe).size / 1048576).toFixed(0)} MB; run it with no arguments, --port N, --no-open)`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function cmdDev(o) {
  if (!o.decks.length) throw new Error(`give a deck folder\n${USAGE}`);
  const dirs = expandDecks(o.decks);
  const hubDir = hubFolder(o.decks, o.hub);
  const publicDir = tmp();
  stageDecks(dirs, publicDir, hubDir);
  const server = await createServer({
    root: rootDir, configFile: join(rootDir, 'vite.config.ts'), publicDir,
    server: { port: o.port, open: o.open, fs: { allow: [rootDir, ...dirs] } },
  });
  await server.listen();
  server.printUrls();
  // a change in a deck folder => restage and reload the page
  let timer;
  for (const d of [...dirs, ...(hubDir ? [hubDir] : [])])
    if (existsSync(d))
      watch(d, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          try { stageDecks(dirs, publicDir, hubDir); server.ws.send({ type: 'full-reload' }); } catch (e) { console.error(String(e.message ?? e)); }
        }, 150);
      });
}

async function cmdCheck(o) {
  if (!o.decks.length) throw new Error(`give a deck folder\n${USAGE}`);
  const { check } = await import('../src/check.ts');
  let n = 0;
  let files = 0;
  for (const d of expandDecks(o.decks))
    for (const f of readdirSync(d).filter((f) => f.endsWith('.slide')).sort()) {
      files++;
      for (const p of check(readFileSync(join(d, f), 'utf8'))) { console.log(`${join(d, f)}:${p.line}: ${p.message}`); n++; }
    }
  console.log(n ? `${n} problem${n === 1 ? '' : 's'} in ${files} files` : `ok: ${files} files`);
  if (n) process.exit(1);
}

async function cmdSchema() {
  const { TAGS } = await import('../src/schema.ts');
  console.log(JSON.stringify(TAGS, null, 2));
}

async function cmdNew(o) {
  if (o.decks.length !== 1) throw new Error(`give the folder to create\n${USAGE}`);
  const { newDeck } = await import('./new.mjs');
  const dir = newDeck(o.decks[0], o.title);
  console.log(`created ${dir}\nnext: slides dev ${o.decks[0]}`);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'build') await cmdBuild(parseArgs(rest));
  else if (cmd === 'dev') await cmdDev(parseArgs(rest));
  else if (cmd === 'new') await cmdNew(parseArgs(rest));
  else if (cmd === 'check') await cmdCheck(parseArgs(rest));
  else if (cmd === 'schema') await cmdSchema();
  else { console.log(USAGE); process.exit(cmd && cmd !== '--help' && cmd !== '-h' ? 1 : 0); }
} catch (e) {
  console.error(`slides: ${e.message ?? e}`);
  process.exit(1);
}
