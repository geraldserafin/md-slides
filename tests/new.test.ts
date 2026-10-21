import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error plain JS, no declarations
import { newDeck } from '../cli/new.mjs';
import { check } from '../src/kernel/check';
import { stockRegistry } from '../src/plugins/index';
import { compileText } from './helpers';

it('slides new makes a deck that parses and passes the check', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'slides-new-')), 'talk');
  newDeck(dir, 'Talk');
  const files = readdirSync(dir).filter((f) => f.endsWith('.slides'));
  expect(files).toEqual(['talk.slides']);
  const src = readFileSync(join(dir, files[0]), 'utf8');
  const { program } = compileText(src, stockRegistry(), 'http://x/talk.slides');
  expect(program.slides).toHaveLength(4);
  expect(program.slides.map((s) => s.own.layout)).toEqual(['cover', 'default', 'default', 'cover']);
  expect(program.meta.title).toBe('Talk');
  expect(check(src, stockRegistry())).toEqual([]);
  expect(() => newDeck(dir, 'Talk')).toThrow(/not empty/);
});
