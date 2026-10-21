// The slide language as data: every node, its arguments, flags, properties and what may sit inside it. The parser reads the layouts
// from here; `slides check` and the editor tooling (completion, hover, diagnostics) read all of it. Keep this file free of imports
// and of TypeScript-only syntax (enums...): node loads it directly.

export interface PropDef {
  doc: string;
  /** the allowed values; absent = free */
  values?: string[];
  /** `number`: the value must be a number */
  type?: 'number';
}

export interface ArgDef {
  name: string;
  doc: string;
  values?: string[];
  optional?: boolean;
}

export interface NodeDef {
  doc: string;
  /** positional arguments, in order (`title "Text"`, `code "rust" "…"`) */
  args?: ArgDef[];
  /** more arguments of the last kind are fine (`head "A" "B"`) */
  rest?: boolean;
  /** bare words that switch something on (`video "a.mp4" loop`), with what each does */
  flags?: Record<string, string>;
  props?: Record<string, PropDef>;
  /** the nodes allowed inside; `part` and `deck-item` stand for the groups below */
  children?: string[];
  /** added by a plugin: the viewer renders it with the plugin's `render` */
  plugin?: boolean;
}

const ANIMS = ['fade', 'rise', 'zoom', 'left', 'right', 'down', 'blur', 'pop', 'none'];
const HALIGN = ['left', 'center', 'right'];
const VALIGN = ['top', 'middle', 'bottom'];
const TRANSITIONS = ['fade', 'slide', 'slide-right', 'slide-left', 'zoom', 'none'];

/** the properties of every node that shows something */
export const FX: Record<string, PropDef> = {
  anim: { doc: 'how it comes in', values: ANIMS },
  id: { doc: 'morph id: the same id on the next slide glides between the two (for `code`: the animation)' },
};

const ALIGN: Record<string, PropDef> = {
  align: { doc: 'horizontal alignment inside its part', values: HALIGN },
  valign: { doc: 'vertical alignment inside its part', values: VALIGN },
};

const LAYOUT: Record<string, PropDef> = {
  size: { doc: 'its share of the row/col: a weight (2), `auto`, or a length ("40%")' },
  gap: { doc: 'space between the parts (a number is in vmin, or any CSS length)' },
  ...ALIGN,
  class: { doc: 'extra CSS class' },
};

const SIZE: Record<string, PropDef> = { size: { doc: 'size relative to the theme', values: ['small', 'large'] } };

const text = (doc: string, extra: Record<string, PropDef> = {}): NodeDef => ({
  doc,
  args: [{ name: 'text', doc: 'the text; inline: **bold** *italic* ~~strike~~ ==mark== ~sub~ ^sup^ `code` [link](url) $tex$ [[Key]]' }],
  props: { ...SIZE, ...ALIGN, ...FX, ...extra },
});
const media = (doc: string, props: Record<string, PropDef>, flags: Record<string, string> = {}): NodeDef => ({
  doc,
  args: [{ name: 'src', doc: 'the file, relative to the .slides file' }],
  props: { width: { doc: 'CSS width' }, height: { doc: 'CSS height' }, ...props, ...ALIGN, ...FX },
  flags,
});

/** the groups of nodes a node may hold */
export const PART_NODES = ['row', 'col', 'grid', 'step', 'pause', 'title', 'heading', 'subheading', 'text', 'list', 'quote', 'table', 'math', 'image', 'video', 'audio', 'code', 'chart', 'diagram', 'notes'];
export const DECK_NODES = ['vars', 'themes', 'fonts', 'google-fonts', 'header', 'footer', 'plugins', 'defaults', 'animation', 'code-style', 'css'];

export const NODES: Record<string, NodeDef> = {
  deck: {
    doc: 'Settings of the whole deck. Optional; once, at the top.',
    props: {
      title: { doc: 'the title of the deck' }, author: { doc: 'the author' }, date: { doc: 'the date' }, description: { doc: 'a line for the gallery' },
      theme: { doc: 'dark, light, paper, or one of the deck\'s themes' }, autoplay: { doc: 'seconds per step: the deck plays itself', type: 'number' },
      loop: { doc: 'start again after the last step when autoplaying', values: ['#true', '#false'] }, thumbnail: { doc: 'gallery image instead of the first slide' },
      order: { doc: 'position in the gallery', type: 'number' }, hidden: { doc: 'not listed in the gallery', values: ['#true', '#false'] },
    },
    children: DECK_NODES,
  },
  vars: { doc: 'CSS variables of the deck, e.g. `vars --accent="#d82838" --font-text="Georgia"`.' },
  themes: { doc: 'Own themes: `themes { sunset --bg="#2a1b2e" --fg="#f0d4c0" }`, one node per theme, its properties are CSS variables.' },
  fonts: { doc: 'Fonts to load: `font "Name" src="fonts/a.woff2" weight="400" style="normal"`.', children: ['font'] },
  font: { doc: 'A font file.', args: [{ name: 'family', doc: 'the font family' }], props: { src: { doc: 'the file' }, weight: { doc: 'e.g. 400' }, style: { doc: 'normal or italic' } } },
  'google-fonts': { doc: 'Google Fonts to load, by name: `google-fonts "Inter" "Lora"`.', args: [{ name: 'family', doc: 'a family' }], rest: true },
  header: { doc: 'A bar above every slide: `left`, `center`, `right` (text with {slide} {slides} {title} {slideTitle} {author} {date}, or an image file).', props: { left: { doc: 'text or image' }, center: { doc: 'text or image' }, right: { doc: 'text or image' }, height: { doc: 'px', type: 'number' }, background: { doc: 'CSS background' }, color: { doc: 'text color' }, border: { doc: 'a hairline under the bar', values: ['#true', '#false'] }, cover: { doc: 'also on cover slides', values: ['#true', '#false'] } } },
  footer: { doc: 'A bar below every slide; the same as `header`.', props: { left: { doc: 'text or image' }, center: { doc: 'text or image' }, right: { doc: 'text or image' }, height: { doc: 'px', type: 'number' }, background: { doc: 'CSS background' }, color: { doc: 'text color' }, border: { doc: 'a hairline over the bar', values: ['#true', '#false'] }, cover: { doc: 'also on cover slides', values: ['#true', '#false'] } } },
  plugins: { doc: 'Plugins (ES modules relative to the deck, or npm package names): `plugins "./qr.js"`.', args: [{ name: 'plugin', doc: 'a file or package' }], rest: true },
  defaults: { doc: 'Settings every slide gets unless it sets its own: `defaults align=center background="bg.jpg"`.', props: { justify: { doc: 'justified paragraphs', values: ['#true', '#false'] }, align: { doc: 'horizontal alignment', values: HALIGN }, valign: { doc: 'vertical alignment', values: VALIGN }, background: { doc: 'a background' }, margin: { doc: 'space around the content (CSS)' }, transition: { doc: 'how content comes in', values: TRANSITIONS } } },
  animation: { doc: 'Timings: `animation move=0.5 fade=0.3 transition=fade`.', props: { move: { doc: 'seconds, code moves', type: 'number' }, fade: { doc: 'seconds, fades', type: 'number' }, ease: { doc: 'CSS timing function' }, transition: { doc: 'how text comes in', values: TRANSITIONS }, stagger: { doc: 'seconds between text blocks', type: 'number' } } },
  'code-style': { doc: 'Look of every code block (a block\'s own properties win).', props: { bg: { doc: '`panel`, `none` or a color' }, lines: { doc: 'line numbers', values: ['#true', '#false'] }, radius: { doc: 'corner radius' }, pad: { doc: 'padding (CSS)' } } },
  css: { doc: 'A stylesheet of the deck: `css "deck.css"`.', args: [{ name: 'file', doc: 'the file' }] },

  slide: {
    doc: 'One slide. Its content is laid out by its layout, chosen from what is in it unless `layout=` says otherwise.',
    props: {
      layout: { doc: 'a built-in or own layout (default: chosen from the content)' },
      columns: { doc: 'proportions of the columns, e.g. "1 2"' },
      ...ALIGN,
      theme: { doc: 'the theme for this slide only' },
      background: { doc: 'an image or looping video (relative to the file), or any CSS background: `linear-gradient(…)`, `#123`' },
      transition: { doc: 'how the content comes in', values: TRANSITIONS },
      animate: { doc: 'continue the previous slide: what is on both (same title, image, code id) stays or glides, the rest swaps', values: ['#true', '#false'] },
      hidden: { doc: 'left out of the show and the PDF (stays in the file)', values: ['#true', '#false'] },
      autoplay: { doc: 'seconds per step when the deck plays itself', type: 'number' },
      header: { doc: '`off` hides the deck\'s header here', values: ['off', 'on'] }, footer: { doc: '`off` hides the deck\'s footer here', values: ['off', 'on'] },
      title: { doc: 'the name shown in the presenter view and the drawer (default: the `title` node)' },
      justify: { doc: 'justified paragraphs (the last line stays at the start)', values: ['#true', '#false'] },
      class: { doc: 'extra CSS class of the stage' },
    },
    children: ['part'],
  },
  layout: {
    doc: 'An own layout: rows and columns with `slot`s, used as `slide layout=name { slotname { … } }`.',
    args: [{ name: 'name', doc: 'the name' }], props: { align: ALIGN.align, valign: ALIGN.valign }, children: ['row', 'col', 'grid'],
  },
  slot: { doc: 'In an own layout: where the content of the slot with this name goes (no name: the content that is in no slot).', args: [{ name: 'name', doc: 'the slot name', optional: true }] },

  row: { doc: 'Its children side by side, sharing the width.', props: LAYOUT, children: ['part'] },
  col: { doc: 'Its children one under the other.', props: LAYOUT, children: ['part'] },
  grid: { doc: 'Its children in a grid.', props: { columns: { doc: 'columns', type: 'number' }, gap: LAYOUT.gap, ...ALIGN, class: LAYOUT.class }, children: ['part'] },
  step: { doc: 'Everything inside appears on the next click.', props: { anim: FX.anim }, children: ['part'] },
  pause: { doc: 'Everything below it appears on the next click.' },

  title: text('The big heading of the slide (also its name in the drawer).'),
  heading: text('A heading.'),
  subheading: text('A smaller heading.'),
  text: text('A paragraph.'),
  quote: text('A quote with an accent bar.', { by: { doc: 'who said it' } }),
  list: {
    doc: 'A list of `-` items; may be nested.', props: { start: { doc: 'the first number (numbered)', type: 'number' }, ...SIZE, ...ALIGN, ...FX },
    flags: { numbered: 'a numbered list', steps: 'one item per click' }, children: ['-'],
  },
  '-': {
    doc: 'An item of a list (a text, and a nested `list`), or a row of a table (its cells).',
    args: [{ name: 'text', doc: 'the text of the item, or a cell' }], rest: true, children: ['list'],
  },
  table: { doc: 'A table: a `head` line and `-` lines.', props: { ...SIZE, ...ALIGN, ...FX }, children: ['head', '-'] },
  head: { doc: 'The header cells of a table.', args: [{ name: 'cell', doc: 'a cell' }], rest: true },
  math: { doc: 'Display math (KaTeX).', args: [{ name: 'tex', doc: 'the formula' }], props: { ...ALIGN, ...FX } },
  image: media('An image.', { alt: { doc: 'alternative text' }, fit: { doc: 'how it fills its box', values: ['contain', 'cover'] } }),
  video: media('A video.', {}, { autoplay: 'play at once (muted)', loop: 'repeat', muted: 'no sound', nocontrols: 'hide the controls' }),
  audio: media('An audio file with a player bar.', {}, { autoplay: 'play at once', loop: 'repeat', nocontrols: 'hide the bar' }),
  code: {
    doc: 'One animated code block. Its `frame`s are the states it passes through; blocks with the same `id` continue each other.',
    args: [{ name: 'lang', doc: 'the language (ts, py, rust, go, cpp…)', optional: true }, { name: 'code', doc: 'the code, when there is only one frame', optional: true }],
    flags: { lines: 'line numbers', nolines: 'no line numbers', nopanel: 'no panel behind the code', loop: 'with autoplay: forth and back without end' },
    props: {
      id: FX.id, from: { doc: 'show a copy of the last frame of the earlier block with this id' },
      title: { doc: 'a caption above the code' }, start: { doc: 'number of the first line', type: 'number' }, size: { doc: 'font size in px', type: 'number' },
      fit: { doc: '`none` turns the automatic scaling off', values: ['none'] },
      autoplay: { doc: 'the frames play by themselves, this many seconds apart', type: 'number' },
      focus: { doc: 'lines to keep bright, e.g. "2-4,7"' }, transition: { doc: 'how a frame is entered', values: ['morph', 'fade', 'none'] },
      bg: { doc: 'panel background color' }, radius: { doc: 'panel corner radius' }, pad: { doc: 'panel padding (CSS)' },
      ...ALIGN, anim: FX.anim,
    },
    children: ['frame'],
  },
  frame: {
    doc: 'A state of a `code` block.', args: [{ name: 'code', doc: 'the code' }],
    props: { focus: { doc: 'lines to keep bright, e.g. "2-4,7"' }, transition: { doc: 'how this frame is entered', values: ['morph', 'fade', 'none'] } },
  },
  chart: {
    doc: 'CSV lines as an SVG chart; the first row names the series.',
    args: [{ name: 'type', doc: 'chart type', values: ['bar', 'line', 'pie'] }, { name: 'csv', doc: 'the data' }],
    props: { title: { doc: 'a title' }, width: { doc: 'CSS width' }, ...FX },
  },
  diagram: { doc: 'A Mermaid diagram.', args: [{ name: 'mermaid', doc: 'the diagram source' }], props: { width: { doc: 'CSS width' }, ...FX } },
  notes: { doc: 'Presenter notes (press p).', args: [{ name: 'text', doc: 'the notes' }] },
};

/** the built-in layouts, with the slots each takes (the first is the default: whatever is not in a slot) */
export const LAYOUTS: Record<string, { doc: string; slots: string[] }> = {
  default: { doc: 'A title and what follows, one column.', slots: [] },
  cover: { doc: 'A title slide: big heading, centered, no header or footer.', slots: [] },
  section: { doc: 'A divider: a big heading alone.', slots: [] },
  center: { doc: 'Everything centered on the slide.', slots: [] },
  quote: { doc: 'A quote in the middle.', slots: [] },
  full: { doc: 'One image or video filling the slide.', slots: [] },
  'two-cols': { doc: 'The title, then two columns.', slots: ['left', 'right'] },
  'three-cols': { doc: 'The title, then three columns.', slots: ['left', 'middle', 'right'] },
  'image-left': { doc: 'The text on the right, the image on the left.', slots: [] },
  'image-right': { doc: 'The text on the left, the image on the right.', slots: [] },
  gallery: { doc: 'The images in a grid.', slots: [] },
  code: { doc: 'A title and code.', slots: [] },
  'code-side': { doc: 'Text on one side, code on the other.', slots: [] },
};

/** a plugin's nodes: they may sit wherever a part may, and take the animation properties */
export function extendSchema(defs: Record<string, Partial<NodeDef>>) {
  for (const [name, def] of Object.entries(defs)) {
    if (NODES[name] && !NODES[name].plugin) continue; // a plugin cannot replace a built-in node
    NODES[name] = { doc: '', args: [{ name: 'text', doc: 'the text of the node', optional: true }], ...def, plugin: true, props: { ...FX, ...(def.props ?? {}) } };
    if (!PART_NODES.includes(name)) PART_NODES.push(name);
  }
}

/** the nodes a node may contain, with `part` expanded */
export function childrenOf(name: string): string[] {
  const out = new Set<string>();
  for (const c of NODES[name]?.children ?? []) for (const n of c === 'part' ? PART_NODES : [c]) out.add(n);
  return [...out];
}

/** the slide properties as a list for completion: same data as NODES.slide.props */
export const SLIDE_PROPS = NODES.slide.props!;
