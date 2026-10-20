import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { check } from '../src/check';
import { parseSlide } from '../src/deck';
import { pluginTags } from '../src/plugin-schema';
import { extendSchema } from '../src/schema';

it('every example slide parses and passes the schema check', async () => {
  const bad: string[] = [];
  for (const d of readdirSync('examples', { withFileTypes: true }).filter((e) => e.isDirectory())) {
    extendSchema(await pluginTags(join('examples', d.name)));
    for (const f of readdirSync(join('examples', d.name)).filter((f) => f.endsWith('.slide'))) {
      const src = readFileSync(join('examples', d.name, f), 'utf8');
      try { parseSlide(src, 'http://x/d/' + f); } catch (e) { bad.push(`${d.name}/${f}: ${(e as Error).message}`); }
      for (const p of check(src)) bad.push(`${d.name}/${f}:${p.line}: ${p.message}`);
    }
  }
  expect(bad).toEqual([]);
});
