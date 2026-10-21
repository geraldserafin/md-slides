// The DOM side of the registry: for every plugin, how its nodes are drawn, what its transitions do, the services it runs while a show
// is on, and its CSS. Loaded once per show (the plugins' runtime parts may be dynamic imports).
import type { Plugin, PluginRuntime, Registry, Render, Service, TransitionDef } from '../kernel/types.ts';

export interface Runtime {
  registry: Registry;
  render(kind: string): Render | undefined;
  transition(name: string): TransitionDef['run'] | undefined;
  services: { plugin: string; service: Service }[];
}

/** CSS of the entrance effects: the hidden pose of every effect (`.pending` is "not there") and what an effect adds to it */
export function effectsCss(registry: Registry): string {
  const out: string[] = [];
  for (const [name, e] of Object.entries(registry.effects())) {
    const sel = `.item[data-anim='${name}']`;
    if (e.pose) out.push(`.item.pending[data-anim='${name}'] { ${e.pose} }`);
    if (e.css) out.push(e.css.replace(/&/g, sel));
  }
  return out.join('\n');
}

let styleEl: HTMLStyleElement | undefined;
const installCss = (css: string) => {
  if (!css || typeof document === 'undefined') return;
  styleEl ??= Object.assign(document.createElement('style'), { dataset: { slidesPlugins: '' } });
  if (!styleEl.isConnected) document.head.append(styleEl);
  if (!styleEl.textContent?.includes(css)) styleEl.textContent += `${css}\n`;
};

export async function loadRuntime(registry: Registry): Promise<Runtime> {
  const renders = new Map<string, Render>();
  const transitions = new Map<string, TransitionDef['run']>();
  const services: Runtime['services'] = [];
  for (const p of registry.plugins as Plugin[]) {
    const rt: PluginRuntime | undefined = typeof p.runtime === 'function' ? await p.runtime() : p.runtime;
    for (const [name, def] of Object.entries(p.nodes ?? {})) if (def.render) renders.set(name, def.render);
    if (rt?.render) for (const [name, r] of Object.entries(rt.render)) renders.set(name, r);
    if (rt?.transitions) for (const [name, run] of Object.entries(rt.transitions)) transitions.set(name, run);
    for (const [name, def] of Object.entries(p.transitions ?? {})) if (def.run) transitions.set(name, def.run);
    if (rt?.service) services.push({ plugin: p.name, service: rt.service });
    if (rt?.css) installCss(rt.css);
  }
  installCss(effectsCss(registry));
  return { registry, render: (k) => renders.get(k), transition: (n) => transitions.get(n), services };
}
