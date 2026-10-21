// The steps of a show: a slide and the stage on it. A plugin's service may prepare more for them (the code plugin parses the code
// of every step and matches the states that follow each other).
import type { Step } from '../kernel/types.ts';
import { isHidden, type Deck } from './deck';

export type { Step };

export async function buildSteps(deck: Deck): Promise<Step[]> {
  const steps: Step[] = [];
  deck.slides.forEach((slide, si) => {
    if (isHidden(slide)) return;
    for (let stage = 0; stage < slide.stages; stage++) steps.push({ slide: si, stage });
  });
  for (const { service } of deck.runtime.services) await service.prepare?.(deck, steps, deck.runtime.registry);
  return steps;
}
