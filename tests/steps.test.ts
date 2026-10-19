import { beforeAll, describe, expect, it } from 'vitest';
import { parseSlide } from '../src/deck';
import { buildSteps } from '../src/steps';
import { setupNodeGrammars } from './nodeGrammars';

beforeAll(setupNodeGrammars);

const deckOf = (...mds: string[]) => ({ name: 't', meta: { files: [] }, slides: mds.map((m) => parseSlide(m, 'http://x/s.md')) });
const keysOf = (st: { keys: Map<number, string> }) => new Set(st.keys.values());
const shared = (a: { keys: Map<number, string> }, b: { keys: Map<number, string> }) => [...keysOf(b)].filter((k) => keysOf(a).has(k)).length;

describe('steps of code groups', () => {
  const frames = (opt: string) =>
    '```ts #a\nfunction f(a) { return a + 1; }\n```\n\n' + `\`\`\`ts #a ${opt}\nfunction f(a) { return a + 2; }\n\`\`\`\n`;

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
    const steps = await buildSteps(deckOf('```ts\nlet a = 1;\n```\n\n```ts\nlet a = 2;\n```\n'));
    expect(steps).toHaveLength(1);
    expect(steps[0].blocks).toHaveLength(2);
    expect(shared(steps[0].blocks[0], steps[0].blocks[1])).toBe(0);
  });

  it('a +++ reveals a block on the next step', async () => {
    const steps = await buildSteps(deckOf('text\n\n+++\n\n```ts\nlet a = 1;\n```\n'));
    expect(steps.map((s) => s.blocks.length)).toEqual([0, 1]);
  });

  it('a group id continues across slides', async () => {
    const steps = await buildSteps(deckOf('```ts #k\nlet a = 1;\n```\n', '```ts #k\nlet a = 2;\n```\n'));
    expect(steps).toHaveLength(2);
    expect(shared(steps[0].blocks[0], steps[1].blocks[0])).toBeGreaterThan(2);
  });

  it('different ids do not morph across slides', async () => {
    const steps = await buildSteps(deckOf('```ts #k\nlet a = 1;\n```\n', '```ts #m\nlet a = 2;\n```\n'));
    expect(shared(steps[0].blocks[0], steps[1].blocks[0])).toBe(0);
  });
});

describe('hidden slides', () => {
  it('are left out of the steps', async () => {
    const d = deckOf('# A\n', '# B\n', '# C\n');
    d.slides[1].meta = { hidden: 'true' };
    const steps = await buildSteps(d);
    expect(steps.map((s) => s.slide)).toEqual([0, 2]);
  });
});
