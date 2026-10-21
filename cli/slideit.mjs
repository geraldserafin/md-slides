#!/usr/bin/env node
// slides -- a .slides language (KDL) -> presentation compiler.
//   slides build <deck...> [-o out] [--target static|single|pdf|exe] [--steps] [--base /sciezka/]
//   slides dev   <deck...> [--port N] [--open]
//   slides new   <folder> [--title "My talk"]
//   slides check <deck...>     slides schema     slides import <file.pptx> <folder>
// A deck = a .slides file, or a folder of them (+ images, videos...). See README.md.
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { stageDecks } from './decks.mjs';
import { buildViewer, hasViewer, loadLib, rootDir, sharedDir, viewerDir } from './viewer.mjs';
import { LANGUAGE_TAGS as tags } from '../src/plugins/code/languages.ts';

const TARGETS = ['static', 'single', 'pdf', 'exe'];

const USAGE = `slides build <deck...> [-o out] [--target static|single|pdf|exe] [--steps] [--base /path/]
slides dev   <deck...> [--port N] [--open] [--vite] [--stop-with-parent]
slides new   <folder> [--title "My talk"]       a starter deck to edit
slides check <deck...>                          find mistakes in the .slides files (file:line: message)
slides import <file.pptx> <folder>               start a deck from a PowerPoint template (backgrounds, logos, colors, margins)
slides schema [<deck>]                          the language as JSON (nodes, layouts, transitions, languages), for editor tooling
slides migrate <folder> [--split] [--remove]    turn an old deck (.slide tags) into .slides
slides lsp                                      the language server (stdio): diagnostics, completion, hover

  <deck> is a folder of .slides files, or a folder of such folders (each one becomes a deck).
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
    else if (a === '--vite') o.vite = true;
    else if (a === '--stop-with-parent') o.stopWithParent = true;
    else if (a === '--split') o.split = true;
    else if (a === '--remove') o.remove = true;
    else if (a.startsWith('-')) throw new Error(`unknown option: ${a}`);
    else o.decks.push(a);
  }
  return o;
}

/** does any deck use a `diagram` node? (the diagram library is left out of the build otherwise) */
function usesMermaid(dirs) {
  return dirs.some((d) => readdirSync(d).some((f) => f.endsWith('.slides') && /(^|[\s{;])diagram[\s"#]/m.test(readFileSync(join(d, f), 'utf8'))));
}

/** languages used by the decks' `code` nodes (to drop unused grammars from the single target) */
function usedLanguages(dirs) {
  const used = new Set();
  for (const d of dirs)
    for (const f of readdirSync(d).filter((f) => f.endsWith('.slides')))
      for (const m of readFileSync(join(d, f), 'utf8').matchAll(/\bcode\s+"([\w+#.-]+)"/g))
        if (tags[m[1].toLowerCase()]) used.add(tags[m[1].toLowerCase()]);
  return used;
}

/** the folder whose hub.json customizes the gallery: --hub, else the first given folder of decks that has one */
function hubFolder(args, hub) {
  if (hub) {
    const p = resolve(hub);
    return existsSync(p) && statSync(p).isFile() ? dirname(p) : p;
  }
  const hasMd = (d) => readdirSync(d).some((f) => f.endsWith('.slides'));
  return args.map((a) => resolve(a)).find((d) => existsSync(join(d, 'hub.json')) && !hasMd(d));
}

/** A folder with .slides files is a deck; a folder of such folders expands to its decks. */
function expandDecks(args) {
  const hasMd = (d) => existsSync(d) && readdirSync(d).some((f) => f.endsWith('.slides'));
  return args.flatMap((a) => {
    const dir = resolve(a);
    if (!existsSync(dir)) throw new Error(`deck folder not found: ${a}`);
    if (hasMd(dir)) return [dir];
    const subs = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && hasMd(join(dir, e.name))).map((e) => join(dir, e.name)).sort();
    if (!subs.length) throw new Error(`no .slides files in: ${a}`);
    return subs;
  });
}

const tmp = () => mkdtempSync(join(tmpdir(), 'slides-'));

/** the viewer plus the decks, into `outDir`: copied from the prebuilt viewer, or built with vite when there is none (a clone) */
async function compile(dirs, outDir, { single = false, base = './' } = {}, hubDir) {
  const variant = { single, mermaid: usesMermaid(dirs) };
  if (hasViewer(variant) && base === './') {
    rmSync(outDir, { recursive: true, force: true });
    cpSync(viewerDir(variant), outDir, { recursive: true });
    if (existsSync(sharedDir)) cpSync(sharedDir, outDir, { recursive: true });
    await stageDecks(dirs, outDir, hubDir);
    return;
  }
  const publicDir = tmp();
  await stageDecks(dirs, publicDir, hubDir);
  await buildViewer({ outDir, publicDir, base, ...variant });
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
    await compile(dirs, out, { base }, hubDir);
    console.log(`static -> ${out}`);
    return;
  }
  const work = tmp();
  try {
    if (o.target === 'single') {
      const out = resolve(o.out ?? `${name}.html`);
      await compile(dirs, work, { single: true }, hubDir);
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
  // started by an editor: stop when it goes away (its end of our stdin closes), however it went
  if (o.stopWithParent) {
    process.stdin.resume();
    process.stdin.on('end', () => process.exit(0));
    process.stdin.on('close', () => process.exit(0));
  }
  for (const sig of ['SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0));
  const dirs = expandDecks(o.decks);
  const hubDir = hubFolder(o.decks, o.hub);
  let publicDir = tmp();
  await stageDecks(dirs, publicDir, hubDir);
  // the prebuilt viewer when there is one (instant start); vite from a clone
  const prebuilt = !o.vite && hasViewer({ single: false, mermaid: true });
  let reload;
  let restage = async () => { await stageDecks(dirs, publicDir, hubDir); };
  if (prebuilt) {
    const { devServer } = await import('./devserver.mjs');
    const roots = (staged) => [staged, viewerDir({ single: false, mermaid: true }), sharedDir];
    const s = devServer(roots(publicDir));
    reload = s.reload;
    // a new folder each time, swapped in when it is complete
    restage = async () => {
      const next = tmp();
      await stageDecks(dirs, next, hubDir);
      const old = publicDir;
      publicDir = next;
      s.setRoots(roots(next));
      setTimeout(() => rmSync(old, { recursive: true, force: true }), 5000);
    };
    const url = await s.listen(o.port);
    console.log(`  ${url}`);
    if (o.open) openBrowser(url);
  } else {
    const { createServer } = await import('vite');
    const server = await createServer({
      root: rootDir, configFile: join(rootDir, 'vite.config.ts'), publicDir,
      server: { port: o.port, open: o.open, fs: { allow: [rootDir, ...dirs] } },
    });
    await server.listen();
    server.printUrls();
    reload = () => server.ws.send({ type: 'full-reload' });
  }
  // a change in a deck folder => restage and reload the page
  let timer;
  for (const d of [...dirs, ...(hubDir ? [hubDir] : [])])
    if (existsSync(d))
      watch(d, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try { await restage(); reload(); } catch (e) { console.error(String(e.message ?? e)); }
        }, 150);
      });
}

function openBrowser(url) {
  const [cmd, ...args] = process.platform === 'darwin' ? ['open'] : process.platform === 'win32' ? ['cmd', '/c', 'start'] : ['xdg-open'];
  spawn(cmd, [...args, url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

async function cmdCheck(o) {
  if (!o.decks.length) throw new Error(`give a deck folder\n${USAGE}`);
  const { check } = await loadLib('kernel/check');
  const { loadRegistry } = await loadLib('node/loader');
  let n = 0;
  let files = 0;
  for (const d of expandDecks(o.decks)) {
    const { registry, problems } = await loadRegistry(d);
    for (const p of problems) console.log(`${d}: ${p}`);
    const names = readdirSync(d).filter((f) => f.endsWith('.slides')).sort();
    const texts = names.map((f) => readFileSync(join(d, f), 'utf8'));
    names.forEach((f, i) => {
      files++;
      for (const p of check(texts[i], registry, texts.filter((_, j) => j !== i))) { console.log(`${join(d, f)}:${p.line}:${p.col}: ${p.message}`); n++; }
    });
  }
  console.log(n ? `${n} problem${n === 1 ? '' : 's'} in ${files} files` : `ok: ${files} files`);
  if (n) process.exit(1);
}

async function cmdLsp() {
  (await loadLib('node/lsp')).serve();
}

async function cmdImport(o) {
  if (o.decks.length !== 2) throw new Error(`give the .pptx/.potx file and the folder to create\n${USAGE}`);
  const { importPptx } = await import('./import.mjs');
  const r = await importPptx(o.decks[0], resolve(o.decks[1]), { title: o.title });
  console.log(`imported ${r.slides} slides, ${r.backgrounds} backgrounds -> ${o.decks[1]}`);
  for (const n of r.notes) console.log(`note: ${n}`);
  console.log(`next: slides dev ${o.decks[1]}`);
}

async function cmdMigrate(o) {
  if (o.decks.length !== 1) throw new Error(`give the deck folder\n${USAGE}`);
  const { migrateDeck } = await import('./migrate.mjs');
  for (const f of migrateDeck(o.decks[0], { split: o.split, remove: o.remove })) console.log(`wrote ${f}`);
  console.log(`next: slides check ${o.decks[0]}${o.remove ? '' : ' (the old .slide files are still there: delete them, or run again with --remove)'}`);
}

async function cmdSchema(o) {
  const { exportSchema } = await loadLib('kernel/schema');
  const { loadRegistry } = await loadLib('node/loader');
  const { stockRegistry } = await loadLib('plugins/index');
  // with a deck folder: the schema with the deck's plugins in it
  const registry = o.decks[0] ? (await loadRegistry(resolve(o.decks[0]))).registry : stockRegistry();
  console.log(JSON.stringify(exportSchema(registry), null, 2));
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
  else if (cmd === 'import') await cmdImport(parseArgs(rest));
  else if (cmd === 'migrate') await cmdMigrate(parseArgs(rest));
  else if (cmd === 'schema') await cmdSchema(parseArgs(rest));
  else if (cmd === 'lsp') await cmdLsp();
  else { console.log(USAGE); process.exit(cmd && cmd !== '--help' && cmd !== '-h' ? 1 : 0); }
} catch (e) {
  console.error(`slides: ${e.message ?? e}`);
  process.exit(1);
}
