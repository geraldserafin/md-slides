// The markup modules (markup, schema, check) as plain JS in lib/: node will not strip the types of .ts files that sit
// under node_modules, which is where an installed package lives. The CLI uses lib/ when it is there and src/ in a clone.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { rootDir } from '../cli/viewer.mjs';

const out = join(rootDir, 'lib');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const name of ['schema', 'markup', 'check', 'lsp', 'plugin-schema']) {
  const ts = readFileSync(join(rootDir, 'src', `${name}.ts`), 'utf8');
  const js = stripTypeScriptTypes(ts, { mode: 'strip' }).replace(/(from '\.\/[\w-]+)\.ts'/g, "$1.js'");
  writeFileSync(join(out, `${name}.js`), js);
}
console.log('lib/ schema markup check lsp plugin-schema');
