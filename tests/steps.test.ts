import { beforeAll, describe, expect, it } from 'vitest';
import { parseSlide } from '../src/deck';
import { buildSteps } from '../src/steps';
import { setupNodeGrammars } from './nodeGrammars';

beforeAll(setupNodeGrammars);

const deckOf = (...mds: string[]) => ({ name: 't', meta: { files: [] }, slides: mds.map((m) => parseSlide(m, 'http://x/s.slide')) });
const keysOf = (st: { keys: Map<number, string> }) => new Set(st.keys.values());
const shared = (a: { keys: Map<number, string> }, b: { keys: Map<number, string> }) => [...keysOf(b)].filter((k) => keysOf(a).has(k)).length;

describe('steps of code groups', () => {
  const frames = (opt: string) =>
    `<code lang=ts ${opt}>\n<frame>function f(a) { return a + 1; }</frame>\n<frame>function f(a) { return a + 2; }</frame>\n</code>`;

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
    const steps = await buildSteps(deckOf('<code lang=ts>let a = 1;</code>\n<code lang=ts>let a = 2;</code>'));
    expect(steps).toHaveLength(1);
    expect(steps[0].blocks).toHaveLength(2);
    expect(shared(steps[0].blocks[0], steps[0].blocks[1])).toBe(0);
  });

  it('a <step> reveals a block on the next step', async () => {
    const steps = await buildSteps(deckOf('<p>text</p>\n<step><code lang=ts>let a = 1;</code></step>'));
    expect(steps.map((s) => s.blocks.length)).toEqual([0, 1]);
  });

  it('a group id continues across slides', async () => {
    const steps = await buildSteps(deckOf('<code lang=ts id=k>let a = 1;</code>', '<code lang=ts id=k>let a = 2;</code>'));
    expect(steps).toHaveLength(2);
    expect(shared(steps[0].blocks[0], steps[1].blocks[0])).toBeGreaterThan(2);
  });

  it('different ids do not morph across slides', async () => {
    const steps = await buildSteps(deckOf('<code lang=ts id=k>let a = 1;</code>', '<code lang=ts id=m>let a = 2;</code>'));
    expect(shared(steps[0].blocks[0], steps[1].blocks[0])).toBe(0);
  });
});

describe('slides without content', () => {
  it('take a step of their own', async () => {
    const steps = await buildSteps(deckOf('<slide>\n  background: x.jpg\n</slide>', '<h1>B</h1>'));
    expect(steps.map((s) => s.slide)).toEqual([0, 1]);
  });
});

describe('hidden slides', () => {
  it('are left out of the steps', async () => {
    const d = deckOf('<h1>A</h1>', '<h1>B</h1>', '<h1>C</h1>');
    d.slides[1].meta = { hidden: 'true' };
    const steps = await buildSteps(d);
    expect(steps.map((s) => s.slide)).toEqual([0, 2]);
  });
});

describe('autoplay blocks', () => {
  it('are one step; the frames are states the viewer plays', async () => {
    const d = deckOf('<code lang=ts autoplay=1><frame>let a = 1;</frame><frame>let a = 2;</frame></code>');
    const steps = await buildSteps(d);
    expect(steps).toHaveLength(1);
    const st = steps[0].blocks[0];
    expect(st.cycle).toHaveLength(2);
    expect(st.cycle![0]).toBe(st);
    expect(shared(st.cycle![0], st.cycle![1])).toBeGreaterThan(2);
  });
});
