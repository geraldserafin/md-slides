import { beforeAll, describe, expect, it } from 'vitest';
import { codeStatesAt } from '../src/plugins/code/runtime';
import { buildSteps } from '../src/runtime/steps';
import { deckOf } from './helpers';
import { setupNodeGrammars } from './nodeGrammars';

beforeAll(setupNodeGrammars);

type S = { keys: Map<number, string> };
const keysOf = (st: S) => new Set(st.keys.values());
const shared = (a: S, b: S) => [...keysOf(b)].filter((k) => keysOf(a).has(k)).length;
const run = async (src: string) => {
  const deck = await deckOf(src);
  const steps = await buildSteps(deck);
  return { steps, at: (i: number) => codeStatesAt(steps[i]) };
};

describe('steps of code in a swap', () => {
  const states = (opt: string) => `slide { swap ${opt} { code "ts" "function f(a) { return a + 1; }"; code "ts" "function f(a) { return a + 2; }" } }`;

  it('the states of a swap morph: tokens are shared', async () => {
    const { steps, at } = await run(states(''));
    expect(steps).toHaveLength(2);
    expect(at(1)[0].transition).toBe('morph');
    expect(shared(at(0)[0], at(1)[0])).toBeGreaterThan(5);
  });

  it('transition=fade: no shared tokens', async () => {
    const { at } = await run(states('transition=fade'));
    expect(at(1)[0].transition).toBe('fade');
    expect(shared(at(0)[0], at(1)[0])).toBe(0);
  });

  it('transition=none: no shared tokens either', async () => {
    const { at } = await run(states('transition=none'));
    expect(at(1)[0].transition).toBe('none');
    expect(shared(at(0)[0], at(1)[0])).toBe(0);
  });

  it('blocks without an id are independent (no morph, both on screen)', async () => {
    const { steps, at } = await run('slide { code "ts" "let a = 1;"; code "ts" "let a = 2;" }');
    expect(steps).toHaveLength(1);
    expect(at(0)).toHaveLength(2);
    expect(shared(at(0)[0], at(0)[1])).toBe(0);
  });

  it('a step reveals a block on the next step', async () => {
    const { at } = await run('slide { text "text"; step { code "ts" "let a = 1;" } }');
    expect([0, 1].map((i) => at(i).length)).toEqual([0, 1]);
  });

  it('an id continues across slides', async () => {
    const { steps, at } = await run('slide { code "ts" "let a = 1;" id=k }\nslide { code "ts" "let a = 2;" id=k }');
    expect(steps).toHaveLength(2);
    expect(shared(at(0)[0], at(1)[0])).toBeGreaterThan(2);
  });

  it('different ids do not morph across slides', async () => {
    const { at } = await run('slide { code "ts" "let a = 1;" id=k }\nslide { code "ts" "let a = 2;" id=m }');
    expect(shared(at(0)[0], at(1)[0])).toBe(0);
  });

  it('the same id in the children of a swap morphs from one child to the next', async () => {
    const { at } = await run('slide { swap { col { heading "a"; code "ts" "let a = 1;" id=k }; col { heading "b"; code "ts" "let a = 2;" id=k } } }');
    expect(shared(at(0)[0], at(1)[0])).toBeGreaterThan(2);
  });
});

describe('slides without content', () => {
  it('take a step of their own', async () => {
    const { steps } = await run('slide background="x.jpg"\nslide { title "B" }');
    expect(steps.map((s) => s.slide)).toEqual([0, 1]);
  });
});

describe('hidden slides', () => {
  it('are left out of the steps', async () => {
    const { steps } = await run('slide { title "A" }\nslide hidden=#true { title "B" }\nslide { title "C" }');
    expect(steps.map((s) => s.slide)).toEqual([0, 2]);
  });
});

describe('swaps that play by themselves', () => {
  it('are one step; the states are a cycle the viewer plays', async () => {
    const { steps, at } = await run('slide { swap autoplay=1 { code "ts" "let a = 1;"; code "ts" "let a = 2;" } }');
    expect(steps).toHaveLength(1);
    const st = at(0)[0];
    expect(st.cycle).toHaveLength(2);
    expect(st.cycle![0].element).toBe(st.element);
    expect(shared(st.cycle![0], st.cycle![1])).toBeGreaterThan(2);
  });
});

describe('a swap that plays by itself inside another swap', () => {
  it('is on screen only while its alternative is', async () => {
    const { steps, at } = await run('slide { swap { col { heading "a"; swap autoplay=1 { code "ts" "let a = 1;"; code "ts" "let a = 2;" } }; col { heading "b" } } }');
    expect(steps).toHaveLength(2);
    expect(at(0)).toHaveLength(1);
    expect(at(1)).toHaveLength(0);
  });
});
