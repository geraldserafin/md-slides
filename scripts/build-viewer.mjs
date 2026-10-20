// Builds the prebuilt viewers (viewer/<variant>/) that a published package ships. Run by `npm run build:viewer` / prepublishOnly.
import { rmSync } from 'node:fs';
import { buildViewer, rootDir, VARIANTS, variantName, viewerDir } from '../cli/viewer.mjs';

rmSync(`${rootDir}/viewer`, { recursive: true, force: true });
for (const v of VARIANTS) {
  await buildViewer({ outDir: viewerDir(v), ...v });
  console.log(`viewer/${variantName(v)}`);
}
