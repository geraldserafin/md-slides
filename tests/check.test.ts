import { describe, expect, it } from 'vitest';
import { check, closest } from '../src/check';
import { childrenOf, NODES } from '../src/schema';

const msgs = (src: string) => check(src).map((p) => p.message);

describe('slides check', () => {
  it('a good deck has no problems', () => {
    expect(msgs('deck title="T" { vars --accent="#f00" }\nslide {\n  title "T"\n  row { col { text "a" }; code "ts" { frame "1;" } }\n  step { list steps numbered { - "x" } }\n}')).toEqual([]);
  });
  it('finds unknown nodes and properties, with a hint', () => {
    expect(msgs('slide { titel "x" }')[0]).toMatch(/unknown node `titel` \(did you mean `title`\?\)/);
    expect(msgs('slide { text "a" foo=1 }')[0]).toMatch(/unknown property `foo`/);
    expect(msgs('slide { text "a" anim=bogus }')[0]).toMatch(/expected fade/);
    expect(msgs('slide { text "a" size="huge" }')[0]).toMatch(/expected small \| large/);
    expect(msgs('slide { code "ts" autoplay="x" "a" }')[0]).toMatch(/expected a number/);
  });
  it('finds nodes in the wrong place', () => {
    expect(msgs('slide { row { - "x" } }')[0]).toMatch(/`-` is not allowed inside `row`/);
    expect(msgs('slide { list { text "x" } }')[0]).toMatch(/`text` is not allowed inside `list`/);
    expect(msgs('text "loose"')[0]).toMatch(/`text` at the top/);
  });
  it('finds missing texts, languages and sources', () => {
    expect(msgs('slide { text }')[0]).toMatch(/`text` needs text/);
    expect(msgs('slide { code { frame "x" } }')[0]).toMatch(/needs a language/);
    expect(msgs('slide { code "ts" }')[0]).toMatch(/has no code/);
    expect(msgs('slide { image }')[0]).toMatch(/`image` needs src/);
  });
  it('knows flags and rejects other words', () => {
    expect(msgs('slide { video "a.mp4" autoplay loop muted }')).toEqual([]);
    expect(msgs('slide { video "a.mp4" loopp }')[0]).toMatch(/did you mean `loop`/);
  });
  it('checks layouts and slots', () => {
    expect(msgs('slide layout=two-cols { left { text "a" }; right { text "b" } }')).toEqual([]);
    expect(msgs('slide layout=two-colz { text "a" }')[0]).toMatch(/unknown layout `two-colz` \(did you mean `two-cols`/);
    expect(msgs('slide layout=default { left { text "a" } }')[0]).toMatch(/unknown node `left`/);
    expect(msgs('layout "side" { row { col size="25%" { slot "s" }; col { slot } } }\nslide layout=side { s { text "a" }; text "b" }')).toEqual([]);
  });
  it('reports syntax errors with their line', () => {
    const p = check('slide {\n  title "a"\n  left { text "l" } right { text "r" }\n}');
    expect(p).toHaveLength(1);
    expect(p[0].line).toBe(3);
  });
  it('only one deck node', () => {
    expect(msgs('deck title="a"\ndeck title="b"')[0]).toMatch(/second `deck`/);
  });
});

describe('schema', () => {
  it('every node a node lists exists', () => {
    for (const t of Object.keys(NODES)) for (const c of childrenOf(t)) expect(NODES[c], `${t} > ${c}`).toBeDefined();
  });
  it('closest finds typos', () => {
    expect(closest('titel', ['title', 'text'])).toBe('title');
    expect(closest('zzzzzz', ['title', 'text'])).toBeUndefined();
  });
});
