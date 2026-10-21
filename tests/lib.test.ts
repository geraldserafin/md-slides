import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

// the plain-JS modules the published package and the VS Code extension run: every import in them must resolve
it('lib/ builds and every module loads', async () => {
  execFileSync(process.execPath, ['scripts/build-lib.mjs'], { stdio: 'ignore' });
  const files = readdirSync('lib', { recursive: true }).map(String).filter((f) => f.endsWith('.js'));
  expect(files).toContain(join('node', 'loader.js'));
  expect(files).toContain(join('kernel', 'check.js'));
  expect(files.some((f) => /runtime\.js$/.test(f))).toBe(false); // the viewer's part stays out
  for (const f of files) await import(pathToFileURL(join(process.cwd(), 'lib', f)).href);
});

it('the stock registry works from lib/ alone', async () => {
  execFileSync(process.execPath, ['scripts/build-lib.mjs'], { stdio: 'ignore' });
  const { stockRegistry } = await import(pathToFileURL(join(process.cwd(), 'lib/plugins/index.js')).href);
  const { check } = await import(pathToFileURL(join(process.cwd(), 'lib/kernel/check.js')).href);
  expect(check('slide { title "x"; swap { text "a"; text "b" } }', stockRegistry())).toEqual([]);
});
