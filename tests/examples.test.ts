import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { check } from '../src/kernel/check';
import { compile } from '../src/kernel/compile';
import { loadRegistry, readDeckMeta } from '../src/node/loader';

it('every example deck compiles and passes the check', async () => {
  const bad: string[] = [];
  for (const d of readdirSync('examples', { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const dir = join('examples', d.name);
    const files = readdirSync(dir).filter((f) => f.endsWith('.slides')).sort();
    if (!files.length) continue;
    const { registry } = await loadRegistry(dir);
    const texts = files.map((f) => readFileSync(join(dir, f), 'utf8'));
    files.forEach((f, i) => {
      for (const p of check(texts[i], registry, texts.filter((_, j) => j !== i))) bad.push(`${d.name}/${f}:${p.line}: ${p.message}`);
    });
    try {
      compile(files.map((f, i) => ({ url: 'http://x/' + f, text: texts[i], name: f })), registry, { name: d.name, meta: readDeckMeta(dir) });
    } catch (e) {
      bad.push(`${d.name}: ${(e as Error).message}`);
    }
  }
  expect(bad).toEqual([]);
});
