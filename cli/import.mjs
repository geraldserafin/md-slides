// `slides import <file.pptx|potx> <folder>`: turns a PowerPoint template into a slideit deck folder to start from. It reads the
// package (a zip), takes the backgrounds (a background image, or a picture that covers a whole slide), logos on the master or
// layouts, the theme colors and fonts and the placeholders' margins, and, when Chrome is around, looks at the background images to find
// the free area of the slide (where text may go) and the colors the template really uses.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, posix } from 'node:path';
import { inflateRawSync } from 'node:zlib';

/** a zip file -> Map name -> Buffer (stored and deflated entries) */
export function readZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file (a .pptx/.potx is one)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(raw) : raw);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const text = (files, name) => files.get(name)?.toString('utf8') ?? '';
const attr = (s, name) => new RegExp(`${name}="([^"]*)"`).exec(s)?.[1];
const rels = (files, part) => {
  const out = {};
  for (const m of text(files, posix.join(posix.dirname(part), '_rels', `${posix.basename(part)}.rels`)).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) out[id] = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(posix.dirname(part), target));
  }
  return out;
};

/** the shapes of a slide, layout or master: pictures (with rect), text boxes (with rect, size), the background */
function readPart(files, part, size) {
  const xml = text(files, part);
  const r = rels(files, part);
  const frac = (s) => {
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"/.exec(s);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(s);
    return off && ext ? { x: +off[1] / size.w, y: +off[2] / size.h, w: +ext[1] / size.w, h: +ext[2] / size.h } : undefined;
  };
  const pics = [...xml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)].map((m) => ({ file: r[attr(/<a:blip\b[^>]*>/.exec(m[0])?.[0] ?? '', 'r:embed')], rect: frac(m[0]) })).filter((p) => p.file);
  const shapes = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map((m) => ({
    type: /<p:ph\b[^>]*type="([^"]*)"/.exec(m[0])?.[1] ?? (/<p:ph\b/.test(m[0]) ? 'body' : 'shape'),
    rect: frac(m[0]),
    text: [...m[0].matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((pp) => [...pp[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join('')).filter(Boolean),
    size: Number(/<a:rPr[^>]*\bsz="(\d+)"/.exec(m[0])?.[1] ?? 0) / 100,
  }));
  const bgXml = /<p:bg>[\s\S]*?<\/p:bg>/.exec(xml)?.[0] ?? '';
  const bgImage = r[attr(/<a:blip\b[^>]*>/.exec(bgXml)?.[0] ?? '', 'r:embed')];
  const bgColor = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(bgXml)?.[1];
  return { pics, shapes, bgImage, bgColor, layout: Object.values(r).find((t) => /slideLayouts\//.test(t)), master: Object.values(r).find((t) => /slideMasters\//.test(t)) };
}

const covers = (p) => p.rect && p.rect.w > 0.9 && p.rect.h > 0.9;

/** the theme colors and fonts of ppt/theme/theme1.xml */
function readTheme(files) {
  const xml = text(files, 'ppt/theme/theme1.xml');
  const color = (name) => {
    const m = new RegExp(`<a:${name}>\\s*<a:(?:srgbClr val|sysClr val="[^"]*" lastClr)="([0-9A-Fa-f]{6})"`).exec(xml);
    return m && `#${m[1].toLowerCase()}`;
  };
  const font = (kind) => new RegExp(`<a:${kind}Font>\\s*<a:latin typeface="([^"]*)"`).exec(xml)?.[1];
  return {
    colors: Object.fromEntries(['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((n) => [n, color(n)])),
    heading: font('major'), text: font('minor'),
    isOfficeDefault: /accent1>\s*<a:srgbClr val="5B9BD5"/i.test(xml) || /accent1>\s*<a:srgbClr val="4472C4"/i.test(xml) || /accent1>\s*<a:srgbClr val="156082"/i.test(xml),
  };
}

/** what a background image looks like, from Chrome: its main color, whether it is dark, the free margins around the drawn parts
 *  (fractions of the slide), and the strongest and darkest colors. Without Chrome: undefined. */
async function analyze(images) {
  let browser;
  try {
    const { default: puppeteer } = await import('puppeteer-core');
    const { findChromium } = await import('./pdf.mjs');
    browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox'] });
  } catch {
    return undefined;
  }
  try {
    const page = await browser.newPage();
    const out = new Map();
    for (const [name, buf] of images) {
      const mime = extname(name).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      out.set(name, await page.evaluate(async (url) => {
        const img = new Image();
        await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = url; });
        const W = 340;
        const H = Math.round((img.height / img.width) * W);
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data;
        const key = (i) => `${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`;
        const counts = new Map();
        for (let i = 0; i < d.length; i += 4) counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
        const [bgKey] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        const bg = bgKey.split(',').map((v) => v * 16 + 8);
        const far = new Uint8Array(W * H);
        for (let i = 0, p = 0; i < d.length; i += 4, p++) far[p] = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 90 ? 1 : 0;
        const colHas = (x) => { for (let y = 0; y < H; y++) if (far[y * W + x]) return true; return false; };
        const rowHas = (y) => { for (let x = 0; x < W; x++) if (far[y * W + x]) return true; return false; };
        const gap = Math.max(2, Math.round(W * 0.012));
        // how far a drawn part reaches in from an edge: the first part met (within 40% of the slide) and its far side, when it is big
        // enough across to matter (a bar along a side, a logo in a corner); `has(i)`: anything in line i counted from the edge,
        // `extent(a, b)`: how much of the other axis lines a..b cover
        const reach = (n, has, extent, minExtent) => {
          const lim = Math.round(n * 0.4);
          let i = 0;
          while (i < lim && !has(i)) i++;
          if (i >= lim) return 0;
          const start = i;
          for (; i < lim; i++) { let empty = true; for (let k = 0; k < gap; k++) if (has(i + k)) { empty = false; break; } if (empty) break; }
          return extent(start, i) >= minExtent ? i : 0;
        };
        const spanY = (x0, x1) => { let lo = H; let hi = -1; for (let y = 0; y < H; y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (far[y * W + x]) { lo = Math.min(lo, y); hi = Math.max(hi, y); break; } return hi < 0 ? 0 : (hi - lo) / H; };
        const spanX = (y0, y1) => { let lo = W; let hi = -1; for (let x = 0; x < W; x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) if (far[y * W + x]) { lo = Math.min(lo, x); hi = Math.max(hi, x); break; } return hi < 0 ? 0 : (hi - lo) / W; };
        const reachLeft = reach(W, (i) => colHas(i), (a2, b2) => spanY(a2, b2), 0.35);
        const reachRight = reach(W, (i) => colHas(W - 1 - i), (a2, b2) => spanY(W - 1 - a2, W - 1 - b2), 0.35);
        // what runs along a side is not in the way of the top and bottom: leave it out from here on
        for (let y = 0; y < H; y++) { for (let x = 0; x <= reachLeft; x++) far[y * W + x] = 0; for (let x = W - 1 - reachRight; x < W; x++) far[y * W + x] = 0; }
        const reachTop = reach(H, (i) => rowHas(i), (a2, b2) => spanX(a2, b2), 0.2);
        const reachBottom = reach(H, (i) => rowHas(H - 1 - i), (a2, b2) => spanX(H - 1 - a2, H - 1 - b2), 0.2);
        const lum = (r, g2, b) => (0.2126 * r + 0.7152 * g2 + 0.0722 * b) / 255;
        let dark = 0;
        for (let i = 0; i < d.length; i += 4) dark += lum(d[i], d[i + 1], d[i + 2]);
        // the strongest saturated color and the darkest frequent color
        let accent; let ink; let best = 0; let bestInk = 0;
        for (const [k, n] of counts) {
          const [r, g2, b] = k.split(',').map((v) => v * 16 + 8);
          const sat = Math.max(r, g2, b) - Math.min(r, g2, b);
          const hex = '#' + [r, g2, b].map((v) => v.toString(16).padStart(2, '0')).join('');
          if (sat > 80 && n > best) { best = n; accent = hex; }
          if (lum(r, g2, b) < 0.3 && n > bestInk && k !== bgKey) { bestInk = n; ink = hex; }
        }
        const hexOf = (a) => '#' + a.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
        return {
          bg: hexOf(bg), dark: dark / (W * H) < 0.5, accent, ink,
          margin: { left: reachLeft / W, right: reachRight / W, top: reachTop / H, bottom: reachBottom / H },
        };
      }, `data:${mime};base64,${buf.toString('base64')}`));
    }
    return out;
  } finally {
    await browser.close();
  }
}

const pct = (v) => `${Math.round(v * 1000) / 10}`;
const q = (s) => (/^[\w./-]+$/.test(s) ? s : JSON.stringify(s));

export async function importPptx(file, outDir, { title } = {}) {
  const files = readZip(readFileSync(file));
  const sz = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(text(files, 'ppt/presentation.xml'));
  const size = { w: Number(sz?.[1] ?? 12192000), h: Number(sz?.[2] ?? 6858000) };
  const notes = [];
  if (Math.abs(size.w / size.h - 16 / 9) > 0.02) notes.push(`The template is ${(size.w / size.h).toFixed(2)}:1, not 16:9: slideit shows slides at the screen's shape, so backgrounds may be cropped or scaled.`);

  const pres = rels(files, 'ppt/presentation.xml');
  const order = [...text(files, 'ppt/presentation.xml').matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => pres[m[1]]).filter(Boolean);
  const theme = readTheme(files);
  const slides = order.map((part) => {
    const s = readPart(files, part, size);
    const layout = s.layout && readPart(files, s.layout, size);
    const master = (layout?.master ?? s.master) && readPart(files, layout?.master ?? s.master, size);
    const bg = s.bgImage ?? s.pics.find(covers)?.file ?? layout?.bgImage ?? layout?.pics.find(covers)?.file ?? master?.bgImage ?? master?.pics.find(covers)?.file;
    // small pictures on the master/layout (logos) and pictures that are not the background
    const logos = [...(layout?.pics ?? []), ...(master?.pics ?? [])].filter((p) => !covers(p) && p.rect && p.rect.w < 0.4 && p.rect.h < 0.3);
    return { part, ...s, bg, logos, master, layoutName: /<p:cSld name="([^"]*)"/.exec(text(files, s.layout ?? ''))?.[1] };
  });

  // backgrounds: the first slide is the cover; the others are content slides
  const backgrounds = [...new Set(slides.map((s) => s.bg).filter(Boolean))];
  const analysis = await analyze(new Map(backgrounds.map((b) => [b, files.get(b)])));
  if (!analysis && backgrounds.length) notes.push('Chrome/Chromium was not found, so the free area of the backgrounds was not measured: margins are the defaults (set CHROMIUM=/path and import again, or edit "margin" in deck.json).');

  mkdirSync(join(outDir, 'assets'), { recursive: true });
  // the first slide's background is the cover, the first different one the content background (the one slides get by default);
  // a template with a single picture uses it for both
  const coverBg = slides[0]?.bg;
  const contentSlides = slides.filter((s) => s.bg && s.bg !== coverBg);
  const contentBg = contentSlides[0]?.bg ?? coverBg;
  const nameOf = new Map();
  const asset = (file) => {
    if (!nameOf.has(file)) {
      const ext = extname(file).toLowerCase();
      const name = file === contentBg ? `content${ext}` : file === coverBg ? `cover${ext}` : `background${nameOf.size + 1}${ext}`;
      nameOf.set(file, name);
      writeFileSync(join(outDir, 'assets', name), files.get(file));
    }
    return `assets/${nameOf.get(file)}`;
  };
  for (const b of backgrounds) asset(b);

  // the content area: the free margins of the content background, plus a breath
  const m = contentBg && analysis?.get(contentBg)?.margin;
  const breath = 2.5;
  const margin = m
    ? `${Math.round(Math.max(m.top * 100, 0) + breath)}vh ${Math.round(Math.max(m.right * 100, 0) + breath)}vw ${Math.round(Math.max(m.bottom * 100, 0) + breath)}vh ${Math.round(Math.max(m.left * 100, 0) + breath)}vw`
    : undefined;

  // colors: a real (non-default) theme wins; else what the backgrounds show
  const content = contentBg && analysis?.get(contentBg);
  // the built-in light or dark theme underneath (code colors, tables...), the template's colors on top
  const mix = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, '0')).join('');
  const themeVars = {};
  const base = content ? (content.dark ? 'dark' : 'light') : 'light';
  const ink = !theme.isOfficeDefault && theme.colors.dk1 ? theme.colors.dk1 : content?.ink;
  const paper = !theme.isOfficeDefault && theme.colors.lt1 ? theme.colors.lt1 : content?.bg;
  const accent = !theme.isOfficeDefault ? theme.colors.accent1 : content?.accent;
  if (ink) Object.assign(themeVars, { '--fg': ink, '--heading': (!theme.isOfficeDefault && theme.colors.dk2) || ink, ...(paper ? { '--muted': mix(ink, paper, 0.62) } : {}) });
  if (accent) themeVars['--accent'] = accent;
  const fonts = {};
  if (!theme.isOfficeDefault) {
    if (theme.heading) fonts['--font-heading'] = `'${theme.heading}', system-ui, sans-serif`;
    if (theme.text) fonts['--font-text'] = `'${theme.text}', system-ui, sans-serif`;
    notes.push(`Fonts named by the template: ${[theme.heading, theme.text].filter(Boolean).join(', ')}. They are not shipped with it: install them, or add font files under "fonts" in deck.json.`);
  }

  // logos on the master/layout go to the header or footer bar, by where they sit
  const bar = {};
  const seen = new Set();
  for (const s of slides.slice(contentBg ? slides.findIndex((x) => x.bg === contentBg) : 0)) {
    for (const l of s.logos) {
      if (seen.has(l.file)) continue;
      seen.add(l.file);
      const top = l.rect.y + l.rect.h / 2 < 0.5;
      const slot = l.rect.x + l.rect.w / 2 < 0.34 ? 'left' : l.rect.x + l.rect.w / 2 > 0.66 ? 'right' : 'center';
      const dest = `assets/logo-${seen.size}${extname(l.file)}`;
      writeFileSync(join(outDir, dest), files.get(l.file));
      (bar[top ? 'header' : 'footer'] ??= { height: 56 })[slot] = dest;
    }
  }

  const name = title ?? slides.find((s) => s.shapes.some((x) => x.text.length))?.shapes.find((x) => x.text.length)?.text[0] ?? basename(file, extname(file));
  const deck = {
    title: name,
    theme: base,
    vars: { '--text-size': 'clamp(21px, 3.5vmin, 46px)', '--heading-size': 'clamp(34px, 5.8vmin, 76px)', ...themeVars, ...fonts },
    defaults: { ...(contentBg ? { background: asset(contentBg) } : {}), ...(margin ? { margin } : {}) },
    columns: { valign: 'center' },
    ...bar,
  };
  writeFileSync(join(outDir, 'deck.json'), JSON.stringify(deck, null, 2) + '\n');

  // one example slide, on the content background
  writeFileSync(join(outDir, '01-hello.slide'), `<h1>Hello world</h1>

<p>The background, colors and margins of the template are in place.</p>

<ul steps>
  <li>Text stays inside the free area of the slide</li>
  <li>Each <c>.slide</c> file is one slide; add more next to this one</li>
</ul>

<notes>Edit or delete this slide.</notes>
`);

  const fence = '```';
  const note = (n) => `\n> ${n}`;
  const list = [...nameOf.values()].map((n) => `- \`assets/${n}\`${n.startsWith('content') ? ' (the default background of every slide)' : n.startsWith('cover') ? ' (the title slide of the template)' : ''}`).join('\n');
  const readme = [
    `# ${name}`,
    '',
    `Imported from \`${basename(file)}\` with \`slides import\`. Preview: \`slides dev .\``,
    '',
    '## What came with the template',
    '',
    list + (Object.keys(bar).length ? '\n- the logos, in the header or footer bar (see deck.json)' : ''),
    '',
    `\`deck.json\` has \`defaults.background\` (the background of every slide) and \`defaults.margin\` (the free area of the slide)${themeVars['--accent'] ? `, and \`vars\` with the colors and sizes (on top of the built-in ${base} theme)` : ''}.`,
    '',
    '## Using a background on one slide',
    '',
    fence,
    '<slide>',
    '  background: assets/cover.jpg',
    '</slide>',
    fence,
    '',
    'A slide with nothing else in it shows only its background: the title slide of the template, for example. For a slide with text on a dark background add `layout: cover`, `text-color: #ffffff` and `heading-color: #ffffff`.',
    ...notes.map(note),
    '',
  ].join('\n');
  writeFileSync(join(outDir, 'README.md'), readme);
  return { name, backgrounds: backgrounds.length, slides: slides.length, notes, margin, analysis: analysis ? Object.fromEntries([...analysis].map(([k, v]) => [nameOf.get(k) ?? k, v])) : undefined, bar };
}
