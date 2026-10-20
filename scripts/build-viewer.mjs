// Builds the prebuilt viewers (viewer/<variant>/) that a published package ships. Run by `npm run build:viewer` / prepublishOnly.
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildViewer, rootDir, sharedDir, VARIANTS, variantName, viewerDir } from '../cli/viewer.mjs';

rmSync(`${rootDir}/viewer`, { recursive: true, force: true });
for (const v of VARIANTS) {
  await buildViewer({ outDir: viewerDir(v), ...v });
  console.log(`viewer/${variantName(v)}`);
}

// what every variant has under the same name and size (content-hashed assets: grammars, fonts) moves to viewer/shared
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const lists = VARIANTS.map((v) => new Map(walk(viewerDir(v)).filter((p) => !/\.(html|js|css)$/.test(p)).map((p) => [relative(viewerDir(v), p), statSync(p).size])));
let moved = 0;
for (const [rel, size] of lists[0]) {
  if (!lists.every((l) => l.get(rel) === size)) continue;
  const to = join(sharedDir, rel);
  mkdirSync(join(to, '..'), { recursive: true });
  cpSync(join(viewerDir(VARIANTS[0]), rel), to);
  for (const v of VARIANTS) rmSync(join(viewerDir(v), rel));
  moved++;
}
console.log(`viewer/shared: ${moved} files`);
