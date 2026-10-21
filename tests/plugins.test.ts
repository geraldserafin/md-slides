import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { check } from '../src/kernel/check';
import { createRegistry, PluginError } from '../src/kernel/registry';
import { definePlugin } from '../src/kernel/index';
import { loadRegistry } from '../src/node/loader';
import { stockRegistry } from '../src/plugins/index';
import { leaves, one } from './helpers';

const badge = definePlugin({
  name: 'badge',
  nodes: {
    badge: { doc: 'A label.', part: true, args: [{ name: 'text', doc: 'the label', optional: true }], props: { color: { doc: 'a color', values: ['red', 'green'] } }, render: () => 'x' },
    dot: { doc: 'A dot.', part: true, render: () => 'o' },
  },
});
const withBadge = () => stockRegistry().use(badge);

describe('plugin nodes', () => {
  it('a node with only a render becomes an element of its kind, with its properties and text', () => {
    const els = leaves(one('slide { badge "new" color=red; dot }', withBadge()));
    expect(els[0]).toMatchObject({ kind: 'badge', props: { text: 'new', color: 'red' } });
    expect(els[1]).toMatchObject({ kind: 'dot' });
  });
  it('take the animation properties and a step', () => {
    const [e] = leaves(one('slide { step { badge "x" anim=zoom id=b } }', withBadge()));
    expect(e).toMatchObject({ at: 1, effect: 'zoom', key: 'b' });
  });
  it('sit in rows like the built-in nodes', () => {
    expect(check('slide { row { badge "a"; text "b" } }', withBadge())).toEqual([]);
  });
  it('are checked: property values, unknown properties', () => {
    expect(check('slide { badge "x" color=blue }', withBadge())[0].message).toMatch(/expected red \| green/);
    expect(check('slide { badge "x" size=3 }', withBadge())[0].message).toMatch(/unknown property `size`/);
  });
  it('cannot take a name over by accident', () => {
    expect(() => stockRegistry().use({ name: 'hijack', nodes: { text: { doc: 'mine', part: true } } })).toThrow(PluginError);
    expect(() => stockRegistry().use({ name: 'hijack', replaces: ['text'], nodes: { text: { doc: 'mine', part: true, render: () => 'x' } } })).not.toThrow();
  });
  it('a plugin of a newer API is refused, and a plugin is registered once', () => {
    expect(() => createRegistry().use({ name: 'future', api: 99 })).toThrow(/plugin API 99/);
    expect(() => createRegistry().use(badge).use(badge)).toThrow(/registered twice/);
  });
  it('an unknown node is an error', () => {
    expect(() => one('slide { nothing }')).toThrow(/unknown node/);
  });
});

describe('what the tools know of the plugins of a deck', () => {
  it('reads a plugin of the current API from deck.json', async () => {
    const deck = mkdtempSync(join(tmpdir(), 'slideit-plugin-'));
    writeFileSync(join(deck, 'deck.json'), JSON.stringify({ plugins: ['./p.js'] }));
    writeFileSync(join(deck, 'p.js'), "export default { name: 'p', nodes: { qr: { doc: 'A QR.', part: true, props: { value: { doc: 'v' } }, render() {} } } };");
    const { registry } = await loadRegistry(deck);
    expect(registry.node('qr')?.props).toEqual({ value: { doc: 'v' } });
  });
  it('prefers the package.json description of an npm plugin (no code runs)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-plugin-npm-'));
    mkdirSync(join(dir, 'node_modules', 'slideit-plugin-x'), { recursive: true });
    writeFileSync(join(dir, 'deck.json'), JSON.stringify({ plugins: ['slideit-plugin-x'] }));
    writeFileSync(join(dir, 'node_modules/slideit-plugin-x/package.json'), JSON.stringify({ name: 'slideit-plugin-x', main: 'i.js', slideit: { nodes: { chip: { doc: 'A chip.', part: true } } } }));
    writeFileSync(join(dir, 'node_modules/slideit-plugin-x/i.js'), 'throw new Error("must not run");');
    expect((await loadRegistry(dir)).registry.node('chip')?.doc).toBe('A chip.');
  });
  it('reads the plugins from a deck node of a .slides file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-plugin-kdl-'));
    writeFileSync(join(dir, 'd.slides'), 'deck { plugins "./p.js" }\nslide { title "x" }');
    writeFileSync(join(dir, 'p.js'), "export default { name: 'p', nodes: { qr: { doc: 'A QR.', part: true, render() {} } } };");
    expect((await loadRegistry(dir)).registry.node('qr')).toBeDefined();
  });
  it('the themes of the deck are themes its slides may name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-plugin-theme-'));
    writeFileSync(join(dir, 'd.slides'), 'deck { themes { sunset --bg="#222" } }\nslide theme=sunset { title "x" }');
    const { registry } = await loadRegistry(dir);
    expect(check('slide theme=sunset { title "x" }', registry)).toEqual([]);
    expect(check('slide theme=nope { title "x" }', registry)[0].message).toMatch(/expected dark \| light \| paper \| sunset/);
  });
  it('a plugin that cannot load in node is reported and left out', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-plugin-dom-'));
    writeFileSync(join(dir, 'deck.json'), JSON.stringify({ plugins: ['./b.js', './missing.js'] }));
    writeFileSync(join(dir, 'b.js'), 'document.title = "x"; export default {};');
    const { problems } = await loadRegistry(dir);
    expect(problems).toHaveLength(2);
  });
});
