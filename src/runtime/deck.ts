// Loading a deck in the browser: the manifest the CLI staged, the files it lists, the plugins of the deck, then the compiler.
// What comes out is a Program (plain data) and the runtime that knows how to draw and move it.
import { compile, parseSource } from '../kernel/compile.ts';
import { asPlugin } from '../kernel/util.ts';
import { KdlError } from '../kernel/kdl.ts';
import type { DeckMeta, Program, Slide } from '../kernel/types.ts';
import { deckFromNode } from '../plugins/core-deck/index.ts';
import { stockRegistry } from '../plugins/index.ts';
import { registerLanguage } from '../plugins/code/parse.ts';
import { fetchFile, fetchJson, fileUrl } from '../files';
import { loadRuntime, type Runtime } from './runtime';

export type { AnimationOpts, BarSpec as ChromeBar, CodeStyle, DeckMeta, Program, Slide } from '../kernel/types.ts';

/** a deck ready to show: the program and the runtime that draws it */
export type Deck = Program & { runtime: Runtime };

/** `hidden=#true` on a slide: it is left out of the presentation (and the PDF) but stays in the files */
export const isHidden = (s: Slide) => /^(true|yes|on|1)$/i.test(s.meta.hidden ?? '');

export async function loadDeck(name: string, base = 'decks'): Promise<Deck> {
  const root = new URL(`${base}/${name}/`, document.baseURI).href;
  const meta = await fetchJson<DeckMeta>(fileUrl(root + 'manifest.json'), `The deck "${name}"`);
  const files = await Promise.all(
    meta.files.map(async (f) => {
      const url = root + encodeURI(f);
      return { url, name: `${name}/${f}`, text: await (await fetchFile(fileUrl(url), `The file ${f}`)).text() };
    }),
  );

  // the plugins of the deck: those of deck.json and of the `deck` nodes, imported before the sources are compiled
  const plugins = [...(meta.plugins ?? [])];
  for (const f of files) {
    try {
      for (const n of parseSource(f)) if (n.name === 'deck') plugins.push(...(deckFromNode(n).plugins ?? []));
    } catch (e) {
      if (!(e instanceof KdlError) && !(e instanceof Error)) throw e; // the compiler reports it below, with the file
    }
  }
  const registry = stockRegistry();
  for (const p of [...new Set(plugins)]) {
    const url = fileUrl(new URL(p, root).href);
    const mod = (await import(/* @vite-ignore */ url)) as { default?: unknown };
    if (!mod.default) throw new Error(`plugin ${p}: no default export`);
    const plugin = asPlugin(mod.default, p);
    registry.use(plugin);
    // a tree-sitter grammar a plugin brings: the wasm is relative to the plugin file
    for (const l of plugin.languages ?? []) if (l.wasm) registerLanguage(l.name, l.tags, new URL(l.wasm, url).href);
  }

  let compiled;
  try {
    compiled = compile(files, registry, { name, meta });
  } catch (e) {
    throw new Error((e as Error).message);
  }
  const { program, registry: full } = compiled;
  // the themes of the plugins join the deck's own
  const own = Object.fromEntries(Object.entries(full.themes()).filter(([, v]) => Object.keys(v).length));
  if (Object.keys(own).length) program.meta.themes = { ...own, ...(program.meta.themes ?? {}) };
  const runtime = await loadRuntime(full);
  return Object.assign(program, { runtime }) as Deck;
}
