// The registry: everything the plugins said about the language, the layouts, the transitions, the languages and the themes, in
// one place. The compiler, `slides check`, the language server and the viewer all read it; nothing else knows what a node is.
import type { EffectDef, LanguageDef, LayoutDef, NodeDef, Plugin, Registry, TransitionDef } from './types.ts';

type TransitionEntry = Omit<TransitionDef, 'run'> & { run?: TransitionDef['run'] };

/** the version of the plugin API this build speaks */
export const API = 1;

export class PluginError extends Error {}

class RegistryImpl implements Registry {
  plugins: Plugin[] = [];
  private nodeDefs: Record<string, NodeDef> = {};
  private layoutDefs: Record<string, LayoutDef> = {};
  private effectDefs: Record<string, EffectDef> = {};
  private transitionDefs: Record<string, TransitionEntry> = {};
  private tags: Record<string, string> = {};
  private themeDefs: Record<string, Record<string, string>> = {};
  /** who owns a name: `node:text` -> core-text */
  private owner = new Map<string, string>();

  node(name: string) { return this.nodeDefs[name]; }
  nodes() { return this.nodeDefs; }
  parts() { return Object.keys(this.nodeDefs).filter((n) => this.nodeDefs[n].part); }
  topNodes() { return Object.keys(this.nodeDefs).filter((n) => this.nodeDefs[n].top); }
  childrenOf(name: string): string[] {
    const out = new Set<string>();
    for (const c of this.nodeDefs[name]?.children ?? []) for (const n of c === 'part' ? this.parts() : [c]) out.add(n);
    return [...out];
  }
  layout(name: string) { return this.layoutDefs[name]; }
  layouts() { return this.layoutDefs; }
  effect(name: string) { return this.effectDefs[name]; }
  effects() { return this.effectDefs; }
  transition(name: string) { return this.transitionDefs[name]; }
  transitions() { return this.transitionDefs; }
  language(tag: string) { return this.tags[tag.toLowerCase()]; }
  languageTags() { return this.tags; }
  themes() { return this.themeDefs; }

  private claim(kind: string, name: string, plugin: Plugin, defs: object) {
    const key = `${kind}:${name}`;
    const prev = this.owner.get(key);
    if (prev && prev !== plugin.name && !plugin.replaces?.includes(name))
      throw new PluginError(`plugin "${plugin.name}": the ${kind} "${name}" is already defined by "${prev}" (put it in \`replaces\` to take it over)`);
    this.owner.set(key, plugin.name);
    void defs;
  }

  use(plugin: Plugin): Registry {
    if (plugin.api !== undefined && plugin.api > API) throw new PluginError(`plugin "${plugin.name}" needs plugin API ${plugin.api}, this version of slides has ${API}`);
    if (this.plugins.some((p) => p.name === plugin.name)) throw new PluginError(`plugin "${plugin.name}" is registered twice`);
    this.plugins.push(plugin);
    for (const [name, def] of Object.entries(plugin.nodes ?? {})) {
      this.claim('node', name, plugin, def);
      this.nodeDefs[name] = { ...def, plugin: plugin.name };
    }
    for (const [name, def] of Object.entries(plugin.layouts ?? {})) {
      this.claim('layout', name, plugin, def);
      this.layoutDefs[name] = def;
    }
    for (const [name, def] of Object.entries(plugin.effects ?? {})) {
      this.claim('effect', name, plugin, def);
      this.effectDefs[name] = def;
    }
    for (const [name, def] of Object.entries(plugin.transitions ?? {})) {
      this.claim('transition', name, plugin, def);
      this.transitionDefs[name] = def;
    }
    for (const l of plugin.languages ?? []) for (const t of l.tags) this.tags[t.toLowerCase()] = l.name;
    Object.assign(this.themeDefs, plugin.themes ?? {});
    return this;
  }

  fork(): Registry {
    const r = new RegistryImpl();
    r.plugins = [...this.plugins];
    r.nodeDefs = { ...this.nodeDefs };
    r.layoutDefs = { ...this.layoutDefs };
    r.effectDefs = { ...this.effectDefs };
    r.transitionDefs = { ...this.transitionDefs };
    r.tags = { ...this.tags };
    r.themeDefs = { ...this.themeDefs };
    r.owner = new Map(this.owner);
    return r;
  }
}

export const createRegistry = (): Registry => new RegistryImpl();

export type { LanguageDef };
