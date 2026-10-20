// The slide markup as data: every tag, its attributes and what may sit inside it. The parser reads the raw tags from here;
// `slideit check` and the editor tooling (completion, hover, diagnostics) read all of it. Keep this file free of imports
// and of TypeScript-only syntax (enums...): node loads it directly.

export interface AttrDef {
  doc: string;
  /** the allowed values; absent = free text */
  values?: string[];
  /** `flag`: a bare word (`autoplay`) is enough */
  flag?: boolean;
}

export interface TagDef {
  doc: string;
  /** the content is not parsed: it runs to the closing tag */
  raw?: boolean;
  /** no content, written `<img ... />` */
  empty?: boolean;
  /** where the tag may sit: `slide` (top level), `section`, `part` (in a row/col/step), `text` (inside a text tag), `code` */
  in: string[];
  /** added by a plugin: the viewer renders it with the plugin's `render` */
  plugin?: boolean;
  /** tags allowed inside (for non-raw tags); `block` and `inline` stand for the groups below */
  children?: string[];
  attrs?: Record<string, AttrDef>;
}

const ANIMS = ['fade', 'rise', 'zoom', 'left', 'right', 'down', 'blur', 'pop', 'none'];

/** the attributes of every tag that has content */
export const FX: Record<string, AttrDef> = {
  anim: { doc: 'how it comes in', values: ANIMS },
  delay: { doc: 'seconds before it comes in' },
  dur: { doc: 'seconds the entrance takes' },
  at: { doc: 'the click it appears on (a number)' },
  out: { doc: 'the click it disappears on (a number)' },
  id: { doc: 'morph id: the same id in the next section or slide glides between the two (for <code>: the animation)' },
};

const ALIGN = ['start', 'center', 'end'];
const LAYOUT: Record<string, AttrDef> = {
  size: { doc: 'its share of the row/col: a weight (2), `auto`, or a length (40%)' },
  halign: { doc: 'horizontal alignment inside the part', values: ALIGN },
  valign: { doc: 'vertical alignment inside the part', values: ALIGN },
};

export const BLOCK_TEXT = ['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'quote', 'table', 'tex'];
export const INLINE_TEXT = ['b', 'i', 's', 'c', 'a', 'kbd', 'mark', 'sub', 'sup', 'br', 'tex'];
export const PART = ['row', 'col', 'step', 'code', 'img', 'video', 'audio', 'chart', 'diagram', 'notes', ...BLOCK_TEXT];

const text = (doc: string, extra: Record<string, AttrDef> = {}): TagDef => ({
  doc, in: ['slide', 'section', 'part'], children: ['inline'],
  attrs: { class: { doc: 'extra CSS class' }, ...LAYOUT, ...FX, ...extra },
});
const inline = (doc: string, extra: Record<string, AttrDef> = {}): TagDef => ({ doc, in: ['text'], children: ['inline'], attrs: extra });
const media = (doc: string, extra: Record<string, AttrDef>): TagDef => ({
  doc, empty: true, in: ['slide', 'section', 'part'],
  attrs: {
    src: { doc: 'the file, relative to the .slide file' },
    class: { doc: 'classes: small, large, left, right...' },
    width: { doc: 'CSS width' }, height: { doc: 'CSS height' }, ...extra, ...FX,
  },
});

export const TAGS: Record<string, TagDef> = {
  slide: { doc: 'Settings of this slide, one `key: value` per line (layout, theme, background, halign, valign, transition, margin, gap, --css-vars...).', raw: true, in: ['slide'] },
  section: { doc: 'One of several sub-presentations of a slide: the old one fades out, the next fades in. Whatever is outside the sections stays on screen.', in: ['slide'], children: ['part'] },
  row: { doc: 'Its children side by side, sharing the width.', in: ['slide', 'section', 'part'], children: ['part'], attrs: { class: { doc: 'extra CSS class' }, ...LAYOUT } },
  col: { doc: 'Its children one under the other.', in: ['slide', 'section', 'part'], children: ['part'], attrs: { class: { doc: 'extra CSS class' }, ...LAYOUT } },
  step: { doc: 'Everything inside appears on the next click.', in: ['slide', 'section', 'part'], children: ['part'], attrs: { at: FX.at, anim: FX.anim, delay: FX.delay, dur: FX.dur, out: FX.out } },
  h1: text('A level 1 heading.'), h2: text('A level 2 heading.'), h3: text('A level 3 heading.'),
  p: text('A paragraph.'),
  quote: text('A quote with an accent bar.'),
  ul: { ...text('A bullet list of <li>.'), children: ['li'], attrs: { ...text('').attrs, steps: { doc: 'one bullet per click', flag: true } } },
  ol: { ...text('A numbered list of <li>.'), children: ['li'], attrs: { ...text('').attrs, steps: { doc: 'one item per click', flag: true }, start: { doc: 'the first number' } } },
  li: { doc: 'A list item; may hold inline tags and a nested <ul>/<ol>.', in: ['text'], children: ['inline', 'ul', 'ol'] },
  table: { ...text('A table of <tr>.'), children: ['tr'] },
  tr: { doc: 'A table row of <th> and <td>.', in: ['text'], children: ['th', 'td'] },
  th: inline('A header cell.', { colspan: { doc: 'columns it spans' } }),
  td: inline('A cell.', { colspan: { doc: 'columns it spans' } }),
  b: inline('Bold.'), i: inline('Italic.'), s: inline('Strikethrough.'), kbd: inline('A key.'), mark: inline('Highlighted text.'),
  sub: inline('Subscript.'), sup: inline('Superscript.'),
  a: inline('A link.', { href: { doc: 'the target; relative paths are relative to the .slide file' }, title: { doc: 'tooltip' } }),
  br: { doc: 'A line break.', empty: true, in: ['text'] },
  c: { doc: 'Inline code. The content is raw.', raw: true, in: ['text'] },
  tex: { doc: 'Math (KaTeX): inline inside a text tag, display math on its own. The content is raw.', raw: true, in: ['slide', 'section', 'part', 'text'], attrs: { ...FX } },
  code: {
    doc: 'One animated code block. Its <frame>s are the states it passes through; blocks with the same id continue each other. The content is raw.',
    raw: true, in: ['slide', 'section', 'part'],
    attrs: {
      lang: { doc: 'the language (ts, py, rust, go, cpp...)' },
      id: FX.id,
      from: { doc: 'show a copy of the last frame of the earlier block with this id' },
      class: { doc: 'lines, nolines, panel, nopanel, left, center, right, top, middle, bottom' },
      size: { doc: 'font size in px' },
      fit: { doc: 'none turns the automatic scaling off', values: ['none'] },
      start: { doc: 'number of the first line' },
      title: { doc: 'a caption above the code' },
      bg: { doc: 'panel background color' }, radius: { doc: 'panel corner radius' }, pad: { doc: 'panel padding (CSS)' },
      halign: { doc: 'horizontal position in its area', values: ALIGN },
      valign: { doc: 'vertical position in its area', values: ALIGN },
      focus: { doc: 'lines to keep bright, e.g. 2-4,7' },
      transition: { doc: 'how a frame is entered', values: ['morph', 'fade', 'none'] },
      autoplay: { doc: 'the frames play by themselves, this many seconds apart' },
      loop: { doc: 'with autoplay: forth and back without end', flag: true },
      at: FX.at, anim: FX.anim, delay: FX.delay, dur: FX.dur, out: FX.out,
    },
  },
  frame: {
    doc: 'A state of a <code> block. The content is raw.', raw: true, in: ['code'],
    attrs: { focus: { doc: 'lines to keep bright, e.g. 2-4,7' }, transition: { doc: 'how this frame is entered', values: ['morph', 'fade', 'none'] }, at: FX.at },
  },
  img: media('An image.', { alt: { doc: 'alternative text' } }),
  video: media('A video.', { autoplay: { doc: 'play at once (muted)', flag: true }, loop: { doc: 'repeat', flag: true }, muted: { doc: 'no sound', flag: true }, controls: { doc: 'false hides the controls', values: ['false'] } }),
  audio: media('An audio file with a player bar.', { autoplay: { doc: 'play at once', flag: true }, loop: { doc: 'repeat', flag: true }, controls: { doc: 'false hides the bar', values: ['false'] } }),
  chart: { doc: 'CSV lines as an SVG chart; the first row names the series. The content is raw.', raw: true, in: ['slide', 'section', 'part'], attrs: { type: { doc: 'chart type', values: ['bar', 'line', 'pie'] }, title: { doc: 'a title' }, width: { doc: 'CSS width' }, ...FX } },
  diagram: { doc: 'A Mermaid diagram. The content is raw.', raw: true, in: ['slide', 'section', 'part'], attrs: { width: { doc: 'CSS width' }, class: { doc: 'extra CSS class' }, ...FX } },
  notes: { doc: 'Presenter notes (press p). The content is raw.', raw: true, in: ['slide', 'section', 'part'] },
};

/** is the content of the tag not parsed? (a plugin's tags are too, when they say `raw`) */
export const isRaw = (tag: string) => TAGS[tag]?.raw === true;

/** a plugin's tags: they may sit wherever a part may, and take the animation attributes */
export function extendSchema(defs: Record<string, Partial<TagDef>>) {
  for (const [name, def] of Object.entries(defs)) {
    if (TAGS[name] && !TAGS[name].plugin) continue; // a plugin cannot replace a built-in tag
    TAGS[name] = { doc: '', in: ['slide', 'section', 'part'], children: def.empty || def.raw ? undefined : ['inline'], ...def, plugin: true, attrs: { ...FX, ...(def.attrs ?? {}) } };
    if (!PART.includes(name)) PART.push(name);
  }
}

/** the tags a tag may contain, with `block`/`inline`/`part` expanded */
export function childrenOf(tag: string): string[] {
  const out = new Set<string>();
  for (const c of TAGS[tag]?.children ?? [])
    for (const n of c === 'inline' ? INLINE_TEXT : c === 'part' ? PART : c === 'block' ? BLOCK_TEXT : [c]) out.add(n);
  return [...out];
}
