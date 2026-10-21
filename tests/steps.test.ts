import { beforeAll, describe, expect, it } from 'vitest';
import { parseSlides } from '../src/deck';
import { buildSteps } from '../src/steps';
import { setupNodeGrammars } from './nodeGrammars';

beforeAll(setupNodeGrammars);

const deckOf = (...srcs: string[]) => ({ name: 't', meta: { files: [] }, slides: srcs.flatMap((s) => parseSlides(s, 'http://x/s.slides').slides) });
const keysOf = (st: { keys: Map<number, string> }) => new Set(st.keys.values());
const shared = (a: { keys: Map<number, string> }, b: { keys: Map<number, string> }) => [...keysOf(b)].filter((k) => keysOf(a).has(k)).length;

describe('steps of code groups', () => {
  const frames = (opt: string) =>
    `slide { swap { code "ts" "function f(a) { return a + 1; }"; code "ts" "function f(a) { return a + 2; }" ${opt} } }`;

  it('frames of a group morph: tokens are shared', async () => {
    const steps = await buildSteps(deckOf(frames('')));
    expect(steps).toHaveLength(2);
    expect(steps[1].transition).toBe('morph');
    expect(shared(steps[0].blocks[0], steps[1].blocks[0])).toBeGreaterThan(5);
  });

  it('transition=fade: no shared tokens', async () => {
    const steps = await buildSteps(deckOf(frames('transition=fade')));
    expect(steps[1].transition).toBe('fade');
    expect(shared(steps[0].blocks[0], steps[1].blocks[0])).toBe(0);
  });

  it('transition=none: no shared tokens and a cut', async () => {
    const steps = await buildSteps(deckOf(frames('transition=none')));
    expect(steps[1].transition).toBe('none');
    expect(shared(steps[0].blocks[0], steps[1].blocks[0])).toBe(0);
  });

  it('blocks without an id are independent (no morph, both on screen)', async () => {
    const steps = await buildSteps(deckOf('slide { code "ts" "let a = 1;"; code "ts" "let a = 2;" }'));
    expect(steps).toHaveLength(1);
    expect(steps[0].blocks).toHaveLength(2);
    expect(shared(steps[0].blocks[0], steps[0].blocks[1])).toBe(0);
  });

  it('a step reveals a block on the next step', async () => {
    const steps = await buildSteps(deckOf('slide { text "text"; step { code "ts" "let a = 1;" } }'));
    expect(steps.map((s) => s.blocks.length)).toEqual([0, 1]);
  });

  it('a group id continues across slides', async () => {
    const steps = await buildSteps(deckOf('slide { code "ts" "let a = 1;" id=k }\nslide { code "ts" "let a = 2;" id=k }'));
    expect(steps).toHaveLength(2);
    expect(shared(steps[0].blocks[0], steps[1].blocks[0])).toBeGreaterThan(2);
  });

  it('different ids do not morph across slides', async () => {
    const steps = await buildSteps(deckOf('slide { code "ts" "let a = 1;" id=k }\nslide { code "ts" "let a = 2;" id=m }'));
    expect(shared(steps[0].blocks[0], steps[1].blocks[0])).toBe(0);
  });
});

describe('slides without content', () => {
  it('take a step of their own', async () => {
    const steps = await buildSteps(deckOf('slide background="x.jpg"\nslide { title "B" }'));
    expect(steps.map((s) => s.slide)).toEqual([0, 1]);
  });
});

describe('hidden slides', () => {
  it('are left out of the steps', async () => {
    const d = deckOf('slide { title "A" }\nslide { title "B" }\nslide { title "C" }');
    d.slides[1].meta = { hidden: 'true' };
    const steps = await buildSteps(d);
    expect(steps.map((s) => s.slide)).toEqual([0, 2]);
  });
});

describe('autoplay blocks', () => {
  it('are one step; the frames are states the viewer plays', async () => {
    const d = deckOf('slide { swap autoplay=1 { code "ts" "let a = 1;"; code "ts" "let a = 2;" } }');
    const steps = await buildSteps(d);
    expect(steps).toHaveLength(1);
    const st = steps[0].blocks[0];
    expect(st.cycle).toHaveLength(2);
    expect(st.cycle![0]).toBe(st);
    expect(shared(st.cycle![0], st.cycle![1])).toBeGreaterThan(2);
  });
});
