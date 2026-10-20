import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { check } from '../src/check';
import { parseSlide, sectionItems } from '../src/deck';
import { pluginTags } from '../src/plugin-schema';
import { extendSchema, TAGS } from '../src/schema';

const parse = (src: string) => parseSlide(src, 'http://x/d/s.slide');

describe('plugin tags', () => {
  extendSchema({
    badge: { doc: 'A label.', attrs: { color: { doc: 'a color', values: ['red', 'green'] } } },
    note: { doc: 'Raw note.', raw: true },
    dot: { doc: 'A dot.', empty: true },
  });

  it('become items of kind custom with their attributes and text', () => {
    const items = sectionItems(parse('<badge color=red>new</badge><dot />').sections[0]);
    expect(items[0]).toMatchObject({ kind: 'custom', tag: 'badge', attrs: { color: 'red' }, text: 'new' });
    expect(items[1]).toMatchObject({ kind: 'custom', tag: 'dot' });
  });
  it('take the animation attributes and a step', () => {
    const [item] = sectionItems(parse('<step><badge anim=zoom id=b>x</badge></step>').sections[0]);
    expect(item).toMatchObject({ at: 1, fx: { anim: 'zoom', morph: 'b' }, attrs: {} });
  });
  it('a raw plugin tag keeps < and &', () => {
    const [item] = sectionItems(parse('<note>a < b && <c></note>').sections[0]);
    expect(item).toMatchObject({ text: 'a < b && <c>' });
  });
  it('sit in rows like the built-in tags', () => {
    expect(check('<row><badge>a</badge><p>b</p></row>')).toEqual([]);
  });
  it('are checked: attribute values, unknown attributes', () => {
    expect(check('<badge color=blue>x</badge>')[0].message).toMatch(/expected red \| green/);
    expect(check('<badge size=3>x</badge>')[0].message).toMatch(/unknown attribute `size`/);
  });
  it('cannot replace a built-in tag', () => {
    extendSchema({ p: { doc: 'hijack' } });
    expect(TAGS.p.plugin).toBeUndefined();
  });
  it('are unknown tags again to a slide that was parsed without the plugin... only until registered', () => {
    expect(() => parse('<nothing />')).toThrow(/not a tag/);
  });
});

describe('plugin schema for the editor tooling', () => {
  const deck = mkdtempSync(join(tmpdir(), 'slideit-plugin-'));

  it('reads the tags of a local plugin module', async () => {
    writeFileSync(join(deck, 'deck.json'), JSON.stringify({ plugins: ['./p.js'] }));
    writeFileSync(join(deck, 'p.js'), "export default { name: 'p', tags: { qr: { doc: 'A QR.', empty: true, attrs: { value: { doc: 'v' } }, render() {} } } };");
    expect(await pluginTags(deck)).toEqual({ qr: { doc: 'A QR.', attrs: { value: { doc: 'v' } }, raw: undefined, empty: true } });
  });
  it('prefers the package.json description of an npm plugin (no code runs)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-plugin-npm-'));
    mkdirSync(join(dir, 'node_modules', 'slideit-plugin-x'), { recursive: true });
    writeFileSync(join(dir, 'deck.json'), JSON.stringify({ plugins: ['slideit-plugin-x'] }));
    writeFileSync(join(dir, 'node_modules/slideit-plugin-x/package.json'), JSON.stringify({ name: 'slideit-plugin-x', main: 'i.js', slideit: { tags: { chip: { doc: 'A chip.' } } } }));
    writeFileSync(join(dir, 'node_modules/slideit-plugin-x/i.js'), 'throw new Error("must not run");');
    expect(await pluginTags(dir)).toEqual({ chip: { doc: 'A chip.' } });
  });
  it('a plugin that cannot load in node leaves its tags unknown', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slideit-plugin-dom-'));
    writeFileSync(join(dir, 'deck.json'), JSON.stringify({ plugins: ['./b.js'] }));
    writeFileSync(join(dir, 'b.js'), 'document.title = "x"; export default {};');
    expect(await pluginTags(dir)).toEqual({});
  });
});
