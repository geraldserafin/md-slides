// Bundles the language server into the extension (server/): the plain-JS modules of ../../src (built by scripts/build-lib.mjs),
// so completion, hover and diagnostics work without installing the slides command. Run: node build-server.mjs
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
execFileSync(process.execPath, [join(root, 'scripts/build-lib.mjs')], { stdio: 'inherit' });
const out = join(here, 'server');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of readdirSync(join(root, 'lib'))) copyFileSync(join(root, 'lib', f), join(out, f));
writeFileSync(join(out, 'package.json'), '{ "type": "module" }\n');
writeFileSync(join(out, 'main.js'), "import { serve } from './lsp.js';\nserve();\n");
console.log('server/');
