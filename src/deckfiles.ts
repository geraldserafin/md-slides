// The files of a deck folder, for the CLI and the editor tooling (node): the `.slides` files in order, and the deck's settings
// (deck.json, if there is one, and the `deck` nodes of the .slides files, which win).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deckFromNode } from './deckmeta.ts';
import { parseKdl } from './kdl.ts';

export const slideFiles = (dir: string): string[] => readdirSync(dir).filter((f) => f.endsWith('.slides')).sort();

export function readDeckMeta(dir: string): Record<string, any> {
  const json = join(dir, 'deck.json');
  let meta: Record<string, any> = {};
  if (existsSync(json)) meta = JSON.parse(readFileSync(json, 'utf8'));
  for (const f of slideFiles(dir)) {
    let nodes;
    try {
      nodes = parseKdl(readFileSync(join(dir, f), 'utf8'));
    } catch {
      continue; // `slides check` reports it
    }
    for (const n of nodes) {
      if (n.name !== 'deck') continue;
      const d = deckFromNode(n) as Record<string, any>;
      const { vars, themes, ...rest } = d;
      Object.assign(meta, rest);
      if (vars) meta.vars = { ...meta.vars, ...vars };
      if (themes) meta.themes = { ...meta.themes, ...themes };
    }
  }
  return meta;
}
