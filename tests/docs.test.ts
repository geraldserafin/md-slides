import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { check } from '../src/kernel/check';
import { stockRegistry } from '../src/plugins/index';

// the `kdl` examples in the docs are real: each one must pass `slides check`
const reg = stockRegistry();
it('the kdl examples of the README, llms.txt and the plugin guide are valid', () => {
  const bad: string[] = [];
  for (const file of ['README.md', 'docs/llms.txt', 'docs/plugins.md']) {
    const text = readFileSync(file, 'utf8');
    let n = 0;
    for (const m of text.matchAll(/^(`{3,})kdl\n([\s\S]*?)\n\1$/gm)) {
      n++;
      for (const p of check(m[2], reg, ["layout \"sidebar\" { row { col { slot \"side\" }; col { slot } } }", 'layout "side" { row { col { slot "s" }; col { slot } } }'])) bad.push(`${file} block ${n}:${p.line}: ${p.message}`);
    }
    expect(n, file).toBeGreaterThan(0);
  }
  expect(bad).toEqual([]);
});
