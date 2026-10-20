import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { parseSlide } from '../src/deck';
it('every example slide parses', () => {
  const bad: string[] = [];
  for (const d of readdirSync('examples', { withFileTypes: true }).filter((e) => e.isDirectory()))
    for (const f of readdirSync(join('examples', d.name)).filter((f) => f.endsWith('.slide')))
      try { parseSlide(readFileSync(join('examples', d.name, f), 'utf8'), 'http://x/d/' + f); } catch (e) { bad.push(`${d.name}/${f}: ${(e as Error).message}`); }
  if (bad.length) throw new Error(bad.join("\n"));
});
