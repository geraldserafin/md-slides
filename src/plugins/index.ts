// The stock plugins: everything the language does out of the box is a plugin, loaded automatically and in this order. A plugin of
// a deck comes after them and may take a name over with `replaces`.
import { createRegistry } from '../kernel/registry.ts';
import type { Plugin, Registry } from '../kernel/types.ts';
import { code } from './code/index.ts';
import { coreDeck } from './core-deck/index.ts';
import { coreLayout } from './core-layout/index.ts';
import { coreMedia } from './core-media/index.ts';
import { coreText } from './core-text/index.ts';
import { coreTimeline } from './core-timeline/index.ts';
import { coreTransitions } from './core-transitions/index.ts';
import { kernelPlugin } from './kernel-plugin.ts';
import { morph } from './morph/index.ts';

export const STOCK: Plugin[] = [kernelPlugin, coreDeck, coreLayout, coreText, coreMedia, coreTimeline, coreTransitions, morph, code];

/** a registry with the stock plugins in it */
export function stockRegistry(): Registry {
  const r = createRegistry();
  for (const p of STOCK) r.use(p);
  return r;
}
