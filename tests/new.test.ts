import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error plain JS, no declarations
import { newDeck } from '../cli/new.mjs';
import { parseSlides } from '../src/deck';
import { check } from '../src/check';

it('slides new makes a deck that parses and passes the check', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'slides-new-')), 'talk');
  newDeck(dir, 'Talk');
  const files = readdirSync(dir).filter((f) => f.endsWith('.slides'));
  expect(files).toEqual(['talk.slides']);
  const src = readFileSync(join(dir, files[0]), 'utf8');
  const { slides, deck } = parseSlides(src, 'http://x/talk.slides');
  expect(slides).toHaveLength(4);
  expect(slides.map((s) => s.own.layout)).toEqual(['cover', 'default', 'code-side', 'cover']);
  expect(deck.title).toBe('Talk');
  expect(check(src)).toEqual([]);
  expect(() => newDeck(dir, 'Talk')).toThrow(/not empty/);
});
