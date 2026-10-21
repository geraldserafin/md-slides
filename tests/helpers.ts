import { compile } from '../src/kernel/compile';
import { walk } from '../src/kernel/lower';
import type { Element, Program, Registry, Slide } from '../src/kernel/types';
import { stockRegistry } from '../src/plugins/index';
import { loadRuntime } from '../src/runtime/runtime';
import type { Deck } from '../src/runtime/deck';

export const compileText = (src: string, registry: Registry = stockRegistry(), url = 'http://x/d/s.slides'): { program: Program; registry: Registry } =>
  compile([{ url, text: src, name: 's.slides' }], registry, { name: 't' });

export const slides = (src: string, registry?: Registry): Slide[] => compileText(src, registry).program.slides;
export const one = (src: string, registry?: Registry): Slide => slides(src, registry)[0];

/** the leaves of a slide, in reading order */
export const leaves = (s: Slide): Element[] => [...walk(s.root)].filter((e) => !e.children);

/** the structure of a slide: leaves are their kinds, containers `{ kind: [children] }` */
export const shape = (e: Element): unknown => (e.children ? { [e.kind]: e.children.map(shape) } : e.kind);

/** a deck with its runtime, as the viewer has it after loading */
export async function deckOf(src: string): Promise<Deck> {
  const { program, registry } = compileText(src);
  return Object.assign(program, { runtime: await loadRuntime(registry) }) as Deck;
}
