import { deflateRawSync } from 'node:zlib';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error plain JS, no declarations
import { importPptx, readZip } from '../cli/import.mjs';

/** a zip file from name -> content (deflated), enough for the reader */
function zip(files: Record<string, string | Buffer>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content);
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const pic = (id: string) => `<p:pic><p:blipFill><a:blip r:embed="${id}"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm></p:spPr></p:pic>`;
const rel = (id: string, target: string) => `<Relationship Id="${id}" Type="x" Target="${target}"/>`;

const pptx = zip({
  'ppt/presentation.xml': '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>',
  'ppt/_rels/presentation.xml.rels': `<Relationships>${rel('rId1', 'slides/slide1.xml')}${rel('rId2', 'slides/slide2.xml')}</Relationships>`,
  'ppt/slides/slide1.xml': `<p:sld><p:cSld>${pic('rId1')}</p:cSld></p:sld>`,
  'ppt/slides/_rels/slide1.xml.rels': `<Relationships>${rel('rId1', '../media/cover.png')}</Relationships>`,
  'ppt/slides/slide2.xml': `<p:sld><p:cSld>${pic('rId1')}</p:cSld></p:sld>`,
  'ppt/slides/_rels/slide2.xml.rels': `<Relationships>${rel('rId1', '../media/content.png')}</Relationships>`,
  'ppt/theme/theme1.xml': '<a:theme><a:clrScheme><a:dk1><a:srgbClr val="112233"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="334455"/></a:dk2><a:accent1><a:srgbClr val="CC3344"/></a:accent1></a:clrScheme><a:fontScheme><a:majorFont><a:latin typeface="Lora"/></a:majorFont><a:minorFont><a:latin typeface="Inter"/></a:minorFont></a:fontScheme></a:theme>',
  'ppt/media/cover.png': 'COVERPNG',
  'ppt/media/content.png': 'CONTENTPNG',
});

it('reads a zip file', () => {
  const files = readZip(pptx);
  expect(files.get('ppt/media/cover.png')?.toString()).toBe('COVERPNG');
  expect([...files.keys()]).toContain('ppt/theme/theme1.xml');
});

it('slides import turns a template into a deck: backgrounds, theme colors, fonts, one example slide', async () => {
  process.env.CHROMIUM = '/nonexistent'; // no image analysis: the structure alone
  const dir = join(mkdtempSync(join(tmpdir(), 'slideit-import-')), 'out');
  const r = await importPptx(writeTmp(pptx), dir, { title: 'Uni' });
  expect(r.slides).toBe(2);
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8'));
  expect(deck.title).toBe('Uni');
  expect(deck.defaults.background).toBe('assets/content.png');
  expect(deck.vars).toMatchObject({ '--fg': '#112233', '--accent': '#cc3344', '--heading': '#334455', '--font-heading': "'Lora', system-ui, sans-serif" });
  expect(readFileSync(join(dir, 'assets/cover.png'), 'utf8')).toBe('COVERPNG');
  expect(readFileSync(join(dir, 'assets/content.png'), 'utf8')).toBe('CONTENTPNG');
  expect(existsSync(join(dir, 'out.slides'))).toBe(true);
  expect(existsSync(join(dir, '01-cover.slide'))).toBe(false);
  expect(r.notes.join(' ')).toMatch(/Chrome|Chromium/);
});

import { writeFileSync } from 'node:fs';
function writeTmp(buf: Buffer) {
  const f = join(mkdtempSync(join(tmpdir(), 'slideit-pptx-')), 't.pptx');
  writeFileSync(f, buf);
  return f;
}
