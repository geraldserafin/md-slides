// What the tools that run in node (`slides check`, the language server, the build) know of a deck folder: its .slides files, its
// settings, and the plugins it lists, loaded on top of the stock ones. A plugin that cannot load in node (it needs the browser
// when it is imported) is reported and left out; its nodes are then unknown to the tools.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseKdl } from '../kernel/kdl.ts';
import { toPlugin } from '../kernel/legacy.ts';
import type { Plugin, Registry } from '../kernel/types.ts';
import { deckFromNode } from '../plugins/core-deck/index.ts';
import { stockRegistry } from '../plugins/index.ts';

export const slideFiles = (dir: string): string[] => readdirSync(dir).filter((f) => f.endsWith('.slides')).sort();

/** the settings of a deck: deck.json, and the `deck` nodes of its .slides files, which win */
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
      const { vars, themes, ...rest } = deckFromNode(n) as Record<string, any>;
      Object.assign(meta, rest);
      if (vars) meta.vars = { ...meta.vars, ...vars };
      if (themes) meta.themes = { ...meta.themes, ...themes };
    }
  }
  return meta;
}

/** the file of a plugin named in a deck, and its package.json when it is an npm package */
export function resolvePlugin(deckDir: string, entry: string): { file: string; root?: string; description?: { entry?: string; nodes?: Plugin['nodes']; tags?: Record<string, { doc?: string; attrs?: Record<string, unknown> }> } } | undefined {
  if (/^[./]/.test(entry)) return { file: join(deckDir, entry) };
  try {
    const pkgFile = createRequire(join(deckDir, 'x.js')).resolve(`${entry}/package.json`, { paths: [deckDir, process.cwd()] });
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
    const d = pkg.slideit;
    return { file: join(dirname(pkgFile), d?.entry ?? pkg.module ?? pkg.main ?? 'index.js'), root: dirname(pkgFile), description: d };
  } catch {
    return undefined;
  }
}

/** the stock plugins plus the ones the deck lists */
export async function loadRegistry(dir: string): Promise<{ registry: Registry; problems: string[] }> {
  const registry = stockRegistry();
  const problems: string[] = [];
  let entries: string[] = [];
  try {
    const meta = readDeckMeta(dir);
    entries = meta.plugins ?? [];
    // the themes the deck defines (deck.json, a `deck` node) are themes its slides may name
    if (meta.themes) registry.use({ name: 'themes:deck', themes: meta.themes });
  } catch {
    return { registry, problems };
  }
  for (const e of entries) {
    const p = resolvePlugin(dir, e);
    if (!p) { problems.push(`plugin not found: ${e}`); continue; }
    try {
      // an npm plugin may describe its nodes as data in package.json: no code runs
      if (p.description?.nodes || p.description?.tags) {
        registry.use(toPlugin({ name: e, nodes: p.description.nodes, tags: p.description.tags }, e));
        continue;
      }
      const mod = await import(pathToFileURL(p.file).href);
      registry.use(toPlugin(mod.default, e));
    } catch (err) {
      problems.push(`plugin ${e} could not be loaded here: ${(err as Error).message}`);
    }
  }
  return { registry, problems };
}
