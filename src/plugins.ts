// Plugins: ES modules a deck lists in deck.json ("plugins": ["./qr.js", "@someone/slideit-plugin-x"]). A plugin default-exports
//   { name, tags, themes, languages, tools, hooks }
// and the viewer loads it before it parses the slides, so its tags are known to the parser. See docs/plugins.md.
import type { Deck } from './deck';
import type { Player } from './player';
import { registerLanguage } from './parse';
import { extendSchema, type AttrDef } from './schema';

export interface PluginApi {
  player: Player;
  deck: Deck;
}

export interface PluginTagContext {
  tag: string;
  attrs: Record<string, string>;
  /** the raw content of a raw tag, otherwise the text directly inside the tag */
  text: string;
  /** the element of the item; fill it, or return what should go into it */
  el: HTMLElement;
  /** the deck folder (a URL ending in /): for files the tag refers to */
  base: string;
}

export interface PluginTag {
  doc: string;
  attrs?: Record<string, AttrDef>;
  raw?: boolean;
  empty?: boolean;
  render(ctx: PluginTagContext): string | Node | void | Promise<string | Node | void>;
}

export interface PluginTool {
  title: string;
  /** an inline SVG (24x24, drawn with currentColor) */
  icon: string;
  run(api: PluginApi): void;
}

export interface Plugin {
  name: string;
  /** new tags */
  tags?: Record<string, PluginTag>;
  /** themes: name -> CSS variables (they join the `t` key cycle) */
  themes?: Record<string, Record<string, string>>;
  /** tree-sitter languages: `tags` are the `lang=` values, `wasm` a URL (relative to the plugin file) */
  languages?: { name: string; tags: string[]; wasm: string }[];
  /** buttons of the toolbox */
  tools?: PluginTool[];
  /** called when the viewer moves to another step */
  hooks?: { step?(api: PluginApi, info: { step: number; slide: number }): void };
}

export const plugins: Plugin[] = [];
const loaded = new Set<string>();

export async function loadPlugins(urls: string[]) {
  for (const url of urls) {
    if (loaded.has(url)) continue;
    loaded.add(url);
    const mod = (await import(/* @vite-ignore */ url)) as { default?: Plugin };
    const p = mod.default;
    if (!p) throw new Error(`plugin ${url}: no default export`);
    plugins.push(p);
    if (p.tags) extendSchema(Object.fromEntries(Object.entries(p.tags).map(([n, t]) => [n, { doc: t.doc, attrs: t.attrs, raw: t.raw, empty: t.empty }])));
    for (const l of p.languages ?? []) registerLanguage(l.name, l.tags, new URL(l.wasm, url).href);
  }
}

export const pluginThemes = () => Object.assign({}, ...plugins.map((p) => p.themes ?? {})) as Record<string, Record<string, string>>;
export const pluginTag = (tag: string): PluginTag | undefined => plugins.map((p) => p.tags?.[tag]).find(Boolean);
