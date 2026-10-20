import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

// the plain-JS modules the published package and the VS Code extension run: every import in them must resolve
it('lib/ builds and every module loads', async () => {
  execFileSync(process.execPath, ['scripts/build-lib.mjs'], { stdio: 'ignore' });
  const files = readdirSync('lib').filter((f) => f.endsWith('.js'));
  expect(files).toContain('plugin-schema.js');
  for (const f of files) await import(pathToFileURL(join(process.cwd(), 'lib', f)).href);
});
