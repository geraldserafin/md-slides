import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error plain JS, no declarations
import { newDeck } from '../cli/new.mjs';
import { parseSlide } from '../src/deck';

it('slides new makes a deck whose slides parse', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'slides-new-')), 'talk');
  newDeck(dir, 'Talk');
  const slides = readdirSync(dir).filter((f) => f.endsWith('.slide'));
  expect(slides).toHaveLength(4);
  for (const f of slides) expect(() => parseSlide(readFileSync(join(dir, f), 'utf8'), 'http://x/' + f)).not.toThrow();
  expect(() => newDeck(dir, 'Talk')).toThrow(/not empty/);
});
