#!/usr/bin/env node
// slides -- kompilator markdown -> prezentacja.
//   slides build <deck...> [-o out] [--target static|single|pdf|exe] [--steps] [--base /sciezka/]
//   slides dev   <deck...> [--port N] [--open]
// Deck = folder z plikami .md (+ deck.json, obrazki, wideo...). Więcej: README.md.
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createLogger, createServer } from 'vite';
import { stageDecks } from './decks.mjs';
import tags from '../src/tags.json' with { type: 'json' };

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['static', 'single', 'pdf', 'exe'];

const USAGE = `slides build <deck...> [-o out] [--target static|single|pdf|exe] [--steps] [--base /path/]
slides dev   <deck...> [--port N] [--open]

  static  strona statyczna (folder; GitHub Pages itp.)           domyślnie -o dist
  single  jeden plik .html, wszystko inline, działa offline      domyślnie -o <deck>.html
  pdf     PDF (slajd na stronę; --steps = strona na krok)        domyślnie -o <deck>.pdf
  exe     samodzielny plik wykonywalny dla bieżącej platformy    domyślnie -o <deck>`;

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
    else if (a.startsWith('-')) throw new Error(`nieznana opcja: ${a}`);
    else o.decks.push(a);
  }
  return o;
}

/** języki użyte w fence'ach decków (do wycięcia nieużywanych gramatyk z trybu single) */
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

const tmp = () => mkdtempSync(join(tmpdir(), 'slides-'));

async function compile(dirs, outDir, extra = {}) {
  const publicDir = tmp();
  stageDecks(dirs, publicDir);
  await build({
    root: webDir, configFile: join(webDir, 'vite.config.ts'), logLevel: 'warn', customLogger: quietLogger(), publicDir,
    build: {
      outDir, emptyOutDir: true, ...extra.build,
      rollupOptions: { ...extra.build?.rollupOptions, onwarn: (w, h) => w.code !== 'EVAL' && h(w) },
    }, ...extra.top,
  });
  rmSync(publicDir, { recursive: true, force: true });
}

async function cmdBuild(o) {
  if (!o.decks.length) throw new Error(`podaj folder decku\n${USAGE}`);
  if (!TARGETS.includes(o.target)) throw new Error(`nieznany target: ${o.target}`);
  const dirs = o.decks.map((d) => resolve(d));
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
      console.log(`single -> ${out} (${(statSync(out).size / 1048576).toFixed(1)} MB, ${n} plików osadzonych)`);
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
      console.log(`exe -> ${exe} (${(statSync(exe).size / 1048576).toFixed(0)} MB; uruchom bez argumentów, --port N, --no-open)`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function cmdDev(o) {
  if (!o.decks.length) throw new Error(`podaj folder decku\n${USAGE}`);
  const dirs = o.decks.map((d) => resolve(d));
  const publicDir = tmp();
  stageDecks(dirs, publicDir);
  const server = await createServer({
    root: webDir, configFile: join(webDir, 'vite.config.ts'), publicDir,
    server: { port: o.port, open: o.open, fs: { allow: [webDir, ...dirs] } },
  });
  await server.listen();
  server.printUrls();
  // zmiana w folderze decku => przeskładaj i przeładuj stronę
  let timer;
  for (const d of dirs)
    if (existsSync(d))
      watch(d, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          try { stageDecks(dirs, publicDir); server.ws.send({ type: 'full-reload' }); } catch (e) { console.error(String(e.message ?? e)); }
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
