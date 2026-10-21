import { describe, expect, it } from 'vitest';
import { check, closest, exportSchema } from '../src/kernel/index';
import { stockRegistry } from '../src/plugins/index';

const reg = stockRegistry();
const msgs = (src: string, siblings: string[] = []) => check(src, reg, siblings).map((p) => p.message);

describe('slides check', () => {
  it('a good deck has no problems', () => {
    expect(msgs('deck title="T" { vars --accent="#f00" }\nslide {\n  title "T"\n  row { col { text "a" }; code "ts" "1;" }\n  step { list steps numbered { - "x" } }\n  swap { code "ts" "a"; code "ts" "b" }\n}')).toEqual([]);
  });
  it('finds unknown nodes and properties, with a hint', () => {
    expect(msgs('slide { titel "x" }')[0]).toMatch(/unknown node `titel` \(did you mean `title`\?\)/);
    expect(msgs('slide { text "a" foo=1 }')[0]).toMatch(/unknown property `foo`/);
    expect(msgs('slide { text "a" anim=bogus }')[0]).toMatch(/expected fade/);
    expect(msgs('slide { text "a" size="huge" }')[0]).toMatch(/expected small \| large/);
    expect(msgs('slide { swap autoplay="x" { text "a"; text "b" } }')[0]).toMatch(/expected a number/);
  });
  it('knows the transitions, effects and layouts the plugins define', () => {
    expect(msgs('slide { swap transition=morph { text "a"; text "b" } }')).toEqual([]);
    expect(msgs('slide { swap transition=wobble { text "a"; text "b" } }')[0]).toMatch(/expected fade \| slide/);
    expect(msgs('slide { text "a" anim=pop }')).toEqual([]);
  });
  it('finds nodes in the wrong place', () => {
    expect(msgs('slide { row { - "x" } }')[0]).toMatch(/`-` is not allowed inside `row`/);
    expect(msgs('slide { list { text "x" } }')[0]).toMatch(/`text` is not allowed inside `list`/);
    expect(msgs('text "loose"')[0]).toMatch(/`text` at the top/);
  });
  it('finds missing texts, languages and sources', () => {
    expect(msgs('slide { text }')[0]).toMatch(/`text` needs text/);
    expect(msgs('slide { code "x" }')[0]).toMatch(/has no code/);
    expect(msgs('slide { code }')[0]).toMatch(/needs a language/);
    expect(msgs('slide { swap { text "a" } }')[0]).toMatch(/at least two/);
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
  it('a layout of another file of the deck can be used', () => {
    expect(msgs('slide layout=side { s { text "a" } }', ['layout "side" { row { col { slot "s" } } }'])).toEqual([]);
  });
  it('plugins and nodes written in the language can be used in the file', () => {
    const plugin = 'plugin "ui" { node "callout" doc="A box" { arg "text"; body { col { text "{text}" } } } }';
    expect(msgs(`${plugin}\nslide { callout "hi" }`)).toEqual([]);
    expect(msgs('slide { callout "hi" }')[0]).toMatch(/unknown node `callout`/);
  });
  it('reports syntax errors with their line', () => {
    const p = check('slide {\n  title "a"\n  left { text "l" } right { text "r" }\n}', reg);
    expect(p).toHaveLength(1);
    expect(p[0].line).toBe(3);
  });
  it('only one deck node', () => {
    expect(msgs('deck title="a"\ndeck title="b"')[0]).toMatch(/second `deck`/);
  });
});

describe('schema', () => {
  it('every node a node lists exists', () => {
    for (const t of Object.keys(reg.nodes())) for (const c of reg.childrenOf(t)) expect(reg.node(c), `${t} > ${c}`).toBeDefined();
  });
  it('closest finds typos', () => {
    expect(closest('titel', ['title', 'text'])).toBe('title');
    expect(closest('zzzzzz', ['title', 'text'])).toBeUndefined();
  });
  it('is exported as data, with the plugin each node came from', () => {
    const s = exportSchema(reg);
    expect(s.nodes.title).toMatchObject({ plugin: 'core-text', part: true });
    expect(s.nodes.slide).toMatchObject({ top: true });
    expect(Object.keys(s.layouts)).toContain('two-cols');
    expect(Object.keys(s.transitions)).toEqual(expect.arrayContaining(['fade', 'morph', 'none']));
    expect(s.plugins).toEqual(['kernel', 'core-deck', 'core-layout', 'core-text', 'core-media', 'core-timeline', 'core-transitions', 'morph', 'code']);
    expect(() => structuredClone(s)).not.toThrow(); // plain data: no functions
  });
});
