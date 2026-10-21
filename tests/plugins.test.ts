import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { check } from '../src/check';
import { parseSlides, sectionItems } from '../src/deck';
import { pluginTags } from '../src/plugin-schema';
import { extendSchema, NODES } from '../src/schema';

const parse = (src: string) => parseSlides(src, 'http://x/d/s.slides').slides[0];

describe('plugin nodes', () => {
  extendSchema({
    badge: { doc: 'A label.', props: { color: { doc: 'a color', values: ['red', 'green'] } } },
    dot: { doc: 'A dot.', args: [] },
  });

  it('become items of kind custom with their properties and text', () => {
    const items = sectionItems(parse('slide { badge "new" color=red; dot }').sections[0]);
    expect(items[0]).toMatchObject({ kind: 'custom', tag: 'badge', attrs: { color: 'red' }, text: 'new' });
    expect(items[1]).toMatchObject({ kind: 'custom', tag: 'dot' });
  });
  it('take the animation properties and a step', () => {
    const [item] = sectionItems(parse('slide { step { badge "x" anim=zoom id=b } }').sections[0]);
    expect(item).toMatchObject({ at: 1, fx: { anim: 'zoom', morph: 'b' }, attrs: {} });
  });
  it('sit in rows like the built-in nodes', () => {
    expect(check('slide { row { badge "a"; text "b" } }')).toEqual([]);
  });
  it('are checked: property values, unknown properties', () => {
    expect(check('slide { badge "x" color=blue }')[0].message).toMatch(/expected red \| green/);
    expect(check('slide { badge "x" size=3 }')[0].message).toMatch(/unknown property `size`/);
  });
  it('cannot replace a built-in node', () => {
    extendSchema({ text: { doc: 'hijack' } });
    expect(NODES.text.plugin).toBeUndefined();
  });
  it('an unknown node is an error', () => {
    expect(() => parse('slide { nothing }')).toThrow(/unknown node/);
  });
});

describe('plugin schema for the editor tooling', () => {
  const deck = mkdtempSync(join(tmpdir(), 'slideit-plugin-'));

  it('reads the tags of a local plugin module', async () => {
    writeFileSync(join(deck, 'deck.json'), JSON.stringify({ plugins: ['./p.js'] }));
    writeFileSync(join(deck, 'p.js'), "export default { name: 'p', tags: { qr: { doc: 'A QR.', empty: true, attrs: { value: { doc: 'v' } }, render() {} } } };");
    expect(await pluginTags(deck)).toEqual({ qr: { doc: 'A QR.', props: { value: { doc: 'v' } } } });
  });
  it('prefers the package.json description of an npm plugin (no code runs)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-plugin-npm-'));
    mkdirSync(join(dir, 'node_modules', 'slideit-plugin-x'), { recursive: true });
    writeFileSync(join(dir, 'deck.json'), JSON.stringify({ plugins: ['slideit-plugin-x'] }));
    writeFileSync(join(dir, 'node_modules/slideit-plugin-x/package.json'), JSON.stringify({ name: 'slideit-plugin-x', main: 'i.js', slideit: { tags: { chip: { doc: 'A chip.' } } } }));
    writeFileSync(join(dir, 'node_modules/slideit-plugin-x/i.js'), 'throw new Error("must not run");');
    expect(await pluginTags(dir)).toEqual({ chip: { doc: 'A chip.' } });
  });
  it('reads the plugins from a deck node of a .slides file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-plugin-kdl-'));
    writeFileSync(join(dir, 'd.slides'), 'deck { plugins "./p.js" }\nslide { title "x" }');
    writeFileSync(join(dir, 'p.js'), "export default { name: 'p', tags: { qr: { doc: 'A QR.', render() {} } } };");
    expect(Object.keys(await pluginTags(dir))).toEqual(['qr']);
  });
  it('a plugin that cannot load in node leaves its tags unknown', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-plugin-dom-'));
    writeFileSync(join(dir, 'deck.json'), JSON.stringify({ plugins: ['./b.js'] }));
    writeFileSync(join(dir, 'b.js'), 'document.title = "x"; export default {};');
    expect(await pluginTags(dir)).toEqual({});
  });
});
