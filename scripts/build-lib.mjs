// The language side of the package (kernel, plugins without their DOM part, node tools) as plain JS in lib/: node will not strip the
// types of .ts files that sit under node_modules, which is where an installed package lives. The CLI uses lib/ when it is there
// and src/ in a clone. The DOM parts (`runtime.ts` of a plugin, and src/runtime) belong to the viewer and are left out.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { rootDir } from '../cli/viewer.mjs';

const out = join(rootDir, 'lib');
rmSync(out, { recursive: true, force: true });

const files = [];
for (const dir of ['kernel', 'plugins', 'node']) {
  const base = join(rootDir, 'src', dir);
  for (const f of readdirSync(base, { recursive: true })) {
    if (!f.endsWith('.ts') || /(^|[\\/])runtime\.ts$/.test(f)) continue;
    // the parts of the code plugin that need the grammars are the viewer's
    if (/code[\\/](gumtree|layout|parse|tokens)\.ts$/.test(f) && dir === 'plugins') continue;
    files.push(join(dir, f));
  }
}
for (const f of files) {
  const ts = readFileSync(join(rootDir, 'src', f), 'utf8');
  const js = stripTypeScriptTypes(ts, { mode: 'strip' }).replace(/(from '\.{1,2}\/[\w./-]+)\.ts'/g, "$1.js'").replace(/(import\('\.\/[\w./-]+)\.ts'\)/g, "$1.js')");
  const dest = join(out, f.replace(/\.ts$/, '.js'));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, js);
}
console.log(`lib/: ${files.length} modules (${relative(rootDir, out)})`);
