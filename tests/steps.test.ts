import { beforeAll, describe, expect, it } from 'vitest';
import { parseSlide } from '../src/deck';
import { buildSteps } from '../src/steps';
import { setupNodeGrammars } from './nodeGrammars';

beforeAll(setupNodeGrammars);

const deckOf = (md: string) => ({ name: 't', meta: { files: [] }, slides: [parseSlide(md, 'http://x/s.md')] });
const shared = async (md: string) => {
  const [a, b] = await buildSteps(deckOf(md));
  const keysA = new Set(a.keys.values());
  return { steps: [a, b], common: [...b.keys.values()].filter((k) => keysA.has(k)).length };
};

describe('per-frame transition option', () => {
  const frames = (opt: string) =>
    '```ts\nfunction f(a) { return a + 1; }\n```\n\n' + `\`\`\`ts ${opt}\nfunction f(a) { return a + 2; }\n\`\`\`\n`;

  it('morphs by default: tokens are shared between frames', async () => {
    const r = await shared(frames(''));
    expect(r.steps[1].transition).toBe('morph');
    expect(r.common).toBeGreaterThan(5);
  });

  it('fade: no shared tokens', async () => {
    const r = await shared(frames('transition=fade'));
    expect(r.steps[1].transition).toBe('fade');
    expect(r.common).toBe(0);
  });

  it('none: no shared tokens and marked as a cut', async () => {
    const r = await shared(frames('transition=none'));
    expect(r.steps[1].transition).toBe('none');
    expect(r.common).toBe(0);
  });
});
