# slideit

Presentations where **code transitions are animated by an AST diff**, written in a small tag markup.

Write each slide as a `.slide` file. When a code block goes through several frames,
the viewer parses both with [tree-sitter](https://tree-sitter.github.io/), matches the two syntax trees
with [GumTree](https://hal.science/hal-01054552), and animates the result: unchanged tokens stay,
moved tokens glide to their new place, removed ones fade out, new ones fade in.

`slideit` is a compiler: it turns a folder of `.slide` files into a static website, a single
self-contained HTML file, a PDF, or a standalone executable.

```sh
npm i -g slideit                        # installs the `slides` command (`slideit` works too; one-off: npx slideit ...)

slides new my-talk                      # a starter deck: cover, bullets, animated code, ending
slides dev my-talk/                     # dev server with live reload
slides build my-talk/ -o dist           # static website (GitHub Pages, Netlify, ...)
slides build my-talk/ -t single         # one .html file, works offline
slides build my-talk/ -t pdf            # PDF
slides build my-talk/ -t exe            # standalone executable
```

> Until the package is published, run the CLI from a clone: `node cli/slideit.mjs <command> ...`.

## Contents

- [Quick start](#quick-start)
- [Writing slides](#writing-slides)
- [Slide settings](#slide-settings)
- [Deck configuration](#deck-configuration-deckjson)
- [Build targets](#build-targets)
- [Viewer controls](#viewer-controls)
- [Adding a language](#adding-a-language)
- [How the diff works](#how-the-diff-works)
- [Development](#development)

## Quick start

Requirements: Node.js 22+ (the `pdf` target also needs Chromium or Chrome).

```sh
git clone <this repo> && cd slideit
npm install
npm run dev            # serves everything in examples/ with live reload
```

A deck is a folder; each `.slide` file in it (sorted by name) is one slide:

```
my-talk/
  01-intro.slide
  02-refactoring.slide
  deck.json          # optional configuration
  diagram.svg        # assets are referenced relative to the .slide file
```

`slides dev` and `slides build` accept one or more deck folders, or a folder of deck folders.
With a single deck the viewer opens it directly; with several it shows a **gallery**: a card per deck with a
live thumbnail of its first slide, the title and a line with author, date and the number of slides. The gallery follows the OS light/dark mode and has a toggle (every animation step counts as a slide, as it does for the audience).
Make the first slide a `layout: cover` slide with a background and the card looks good.

### Customizing the chooser (`hub.json`)

Put a `hub.json` in the folder that holds the deck folders (or point at one with `--hub <file|folder>`). Files next to it
that are not decks (a logo, a stylesheet, fonts) are served with it; paths in `hub.json` are relative to that folder.

```json
{
  "title": "Acme talks",
  "subtitle": "Engineering all-hands",
  "logo": "logo.svg",
  "footer": "Acme Corp · internal",
  "theme": "dark",
  "align": "center",
  "order": ["roadmap", "postmortem"]
}
```

| Key | Purpose |
| --- | --- |
| `title`, `subtitle` | the heading of the page (also the browser tab title); default `slides` and a tagline |
| `logo` | an image above the title |
| `footer`, `links` | a line of small text and a list of `{ "text", "href" }` links at the very bottom of the page, followed by a fixed "Made by Gerald Serafin" |
| `theme` | start theme: `dark`, `light`, `paper` or one of your own `themes` (a visitor's saved choice wins) |
| `schemes` | `{ "light": ..., "dark": ... }`: your own themes for the toggle to switch between (default: the built-in `light` and `dark`) |
| `themes`, `fonts`, `googleFonts`, `css` | like in `deck.json`: your own colors, fonts and an extra stylesheet for the page |
| `align` | `start` (default) or `center` for the header and footer |
| `cardWidth` | minimum card width in px (default 340) |
| `show` | what the line under a card title lists, from `author`, `date`, `slides` (default all three) |
| `order` | deck folder names, first to last; the others follow in their usual order |
| `colorToggle` | `false` hides the light/dark button |

## Examples

`examples/` is a chooser with two kinds of decks. **Learn the tool** is a manual made with the tool itself, split by topic; every slide uses the feature it describes:

| Deck | Shows |
| --- | --- |
| `showcase` | a short tour: code morphing, the diff, math, charts, diagrams, morph, themes |
| `writing` | the .slide syntax: sections, clicks, text and media, math, charts, diagrams, rows and columns, per-element animation |
| `code-animation` | the AST diff: every kind of edit, frames, languages, code options, focus, fit, frame transitions, how matching works |
| `theming` | alignment, themes, backgrounds, motion, header/footer, `deck.json`, fonts, CSS |
| `presenting` | controls, presenter view and tools, export, build targets, GitHub Pages, writing decks with an LLM |

**Example talks** are complete decks for different kinds of talks, to read and copy:

| Deck | Shows |
| --- | --- |
| `pitch` | a startup pitch: big statements, a flow diagram, bar and pie charts, a table, the ask |
| `quarterly` | a business review: steps on click, line and bar charts, a metrics table, risks and decisions |
| `lecture` | a physics lecture: math, a diagram, a chart, a quiz that reveals its answer |
| `workshop` | a baking workshop: an ingredients grid, a timeline diagram, steps on click, hydration math |
| `trip` | a photo-story style deck: full-screen gradients, big type, slide and zoom transitions |
| `refactoring` | TypeScript: types, naming, functional style, Extract Method (code-centric) |
| `python-idioms`, `monads` | hidden for now |

## Writing slides

A slide is a `.slide` file made of **tags**. Tags are strict (an unknown tag, a missing closing tag or text outside a tag is an
error with the line number). Attributes are `key=value`, quoted when they contain spaces; a bare word is a flag (`autoplay`);
a tag without content ends with `/>`. The content of `<code>`, `<c>`, `<tex>`, `<chart>`, `<diagram>`, `<notes>` and `<slide>` is **raw**:
`<` and `&` need no escaping there, and the common indentation is removed. To write a closing tag as text inside one, put a
backslash before it: `\</code>`. In the text tags write `&lt;` for a `<`.

```text
<slide>
  theme: light
</slide>

<h2>Plan</h2>

<row>                                    <!-- two parts side by side -->
  <p>The first point is there from the start.</p>
  <code lang=ts>
    <frame>let total = 0;</frame>        <!-- states of one block: a click each -->
    <frame>let total = items.length;</frame>
  </code>
</row>

<step><p>The second point appears on a click.</p></step>
<notes>Say this out loud.</notes>
```

| Tag | Does | Attributes |
| --- | --- | --- |
| `<slide>` | settings of this slide, one `key: value` per line (see below) | |
| `<section>` | one of several sub-presentations in a slide: the old one fades out, the next fades in; whatever is outside the sections stays on screen | |
| `<row>` | its children side by side, sharing the width | `size` `halign` `valign` `class` |
| `<col>` | its children one under the other | the same |
| `<step>` | everything inside appears on the next click | `at=3` (click 3) |
| `<h1>` `<h2>` `<h3>` `<p>` `<quote>` | headings, paragraphs, quotes: each is one item | `class`, `size` `halign` `valign` (its part of a row), animation attributes |
| `<ul>` `<ol>` with `<li>` | lists | `steps` (one bullet per click), `start` |
| `<table>` with `<tr>` `<th>` `<td>` | a table | |
| `<b>` `<i>` `<s>` `<c>` `<a href>` `<kbd>` `<mark>` `<sub>` `<sup>` `<br />` | inline: bold, italic, strikethrough, code, link, key, highlight, sub/superscript, line break | |
| `<tex>` | math (KaTeX): inline inside a `<p>`, display on its own | |
| `<code>` | one animated code block | `lang` `id` `from` `class` `size` `fit` `start` `title` `halign` `valign` `focus` `transition` `at` |
| `<frame>` | a state of a `<code>` | `focus` `transition` `at` |
| `<img>` `<video>` `<audio>` | media, `src` relative to the `.slide` file | `alt` `class` `width` `height` `autoplay` `loop` `muted` `controls=false` |
| `<chart>` | CSV lines as an SVG chart | `type=bar\|line\|pie` `title` `width` |
| `<diagram>` | a Mermaid diagram | `width` `class` |
| `<notes>` | presenter notes | |

**Animation attributes** work on every tag with content: `anim` (`fade`, `rise` (default), `zoom`, `left`, `right`, `down`, `blur`,
`pop`, `none`), `delay` and `dur` (seconds), `at` (the click it comes in on), `out` (the click it leaves on) and `id` (see morph).
A `<step>` passes its animation attributes on to what is inside.

**Animated code.** A `<code>` is one block; its `<frame>`s are the states it passes through. The first one is there with the block,
each next one takes a click, and the diff between two frames is what moves. A block with a single state needs no `<frame>`:

```text
<code lang=ts>
  <frame>
    function total(items: number[]) {
      let sum = 0;
      for (const x of items) sum += x;
      return sum;
    }
  </frame>
  <frame>
    function total(items: number[]) {
      return items.reduce((sum, x) => sum + x, 0);
    }
  </frame>
</code>
```

Blocks are **independent** unless they share an `id`: the same `id` in another section or slide continues the animation from the
last frame it showed. `<code from=total />` shows a copy of the last frame of the earlier block with that id (an independent block).
Tabs are expanded to four spaces; a `lang` without a grammar is shown as static code. Options are attributes of the tag:

| Attribute | Meaning |
| --- | --- |
| `halign=start\|center\|end` (or `class="left"`, `center`, `right`) | horizontal position of the code block in its area; default: the slide's `halign` (start) |
| `valign=start\|center\|end` (or `class="top"`, `middle`, `bottom`) | vertical position of the code block in its area; default: the slide's `valign` (start) |
| `id=name` | the animation: blocks with the same id continue each other; also a target for `from` |
| `class="lines"` / `nolines`, `start=10` | line numbers, and the number of the first line |
| `class="panel"` (or `bg`) / `nopanel`, `bg=#16213e`, `radius=12`, `pad="1em 1.4em"` | a background box around the code; `bg=` sets its color (and switches it on) |
| `title="cart.ts"` | a caption above the code, e.g. a file name |
| `size=18` | fixed font size in px |
| `fit=none` | disable automatic scaling to the available space |
| `focus=2-4,7` | keep these lines (1-based) bright and dim the rest; on a `<frame>` to walk through code |
| `transition=morph\|fade\|none` | how *this frame* is entered from the previous one: the diff animation (default), a plain cross-fade, or a hard cut |
| `at=3` | the click a frame (or the whole block) appears on |
| `autoplay=1`, `loop` | the frames play by themselves, 1 s apart (a bare `autoplay` is 2 s); with `loop` they go forth and back without end. They take no clicks and are not steps: → goes on to whatever comes next, and the progress bar ignores them |

The font size is fitted to the largest frame of a section and stays constant across its frames.

**Reveal.** `<step>` hides what is inside until the next click, like PowerPoint's build-in animations. It works for anything and
nothing moves when the content appears (its space is reserved). `<step at=3>` is click 3. `<ul steps>` (or `<ol steps>`) shows a list
bullet by bullet. Frames of a `<code>` count as clicks too:

```text
<p>The first point is there from the start.</p>

<step><p>The second appears on a click.</p></step>

<step>
  <code lang=ts>const third = "a code block on the last click";</code>
</step>
```

**Rows and columns.** A slide is one column by default (title, text, code, from the top left). A `<row>` puts its children **side by
side** and gives each an equal share of the width; a `<col>` **stacks** its children. Nest them for any layout: two columns, three, a
title above two parts, a 2 × 2 grid, a sidebar next to a stack. The parts always add up to the whole slide (minus the margin).
Every direct child of a row is a part; use a `<col>` to put several things into one part.
In a `<col>` text and images take the height of their content and a `<row>` or `<col>` inside takes the rest.

```text
<h2>What the diff does</h2>              <!-- a title on top, then: -->

<row>
  <col>
    <h3>rename</h3>
    <code lang=ts>...</code>
  </col>
  <col size=2>                           <!-- twice as wide -->
    <h3>insert</h3>
    <code lang=ts>...</code>
  </col>
</row>
```

`size` on a part of a row is a weight (`size=2`), `auto` (the size of its content) or a CSS length (`size=40%`). `halign` and
`valign` align the content inside a part. Code blocks in parts next to each other share one font size. `margin` and `gap` in
the `<slide>` block set the space around and between the parts.

**Sections (a sub-presentation).** Whatever sits outside the `<section>`s stays on screen while they swap one after another. Use it
for a title with several examples that you present one at a time:

```text
<h1>What the diff does</h1>               <!-- outside the sections: stays -->

<section>                                <!-- section 1 (then → plays its code, → again for the next) -->
  <h2>rename</h2>
  <code lang=ts>...</code>
</section>
<section>                                <!-- section 2 -->
  <h2>insert</h2>
  <code lang=ts>...</code>
</section>
```

Without a `<section>` the whole slide is one section; a heading never splits a slide by itself. (Outside the sections only text, media and code in a single column are supported.)

**Images and video.** Paths are relative to the `.slide` file. Audio gives a player bar and stops when the slide changes.

```text
<img src=diagram.svg class=left width=420px />
<video src=clip.mp4 autoplay loop muted />
<audio src=talk.mp3 autoplay loop />
```

**Morph for anything.** Code morphs by itself; any other item can too. Items with the same `id` glide from their place on the
section (or slide) that leaves to their place on the one that arrives, scaling as they go; if their content changed it cross-fades
on the way. Images with the same file match automatically (`morph=none` turns that off).

**Math.** `<tex>x^2</tex>` inside a `<p>` is inline math, a `<tex>` on its own is display math; both are rendered with
[KaTeX](https://katex.org) (plain HTML, so it works in every target and in the PDF). Display math follows the slide's alignment and
reveals like any item.

**Charts.** A `<chart>` turns CSV lines into an SVG chart in the slide's colors. The first row names the series (its first cell is the
label column); `type` is `bar` (default), `line` or `pie` (the first series), `title` and `width` are optional. Bars grow and lines draw
themselves when the chart appears.

```text
<chart type=bar title="Build time (s)">
  tool, cold, warm
  webpack, 12, 4
  vite, 3, 1.2
</chart>
```

**Diagrams.** A `<diagram>` draws a [Mermaid](https://mermaid.js.org) diagram in the slide's colors (it is redrawn when the theme
changes); `width=70%` sizes it. The library is loaded on first use and left out of builds whose decks have no `<diagram>`.

**Text.** Headings `<h1>`–`<h3>`, paragraphs `<p>`, quotes `<quote>`, lists `<ul>`/`<ol>` with `<li>` (nest a list inside an `<li>`), tables
with `<tr>` `<th>` `<td>`, and inline `<b>` `<i>` `<s>` `<c>` (code, raw) `<a href>` `<kbd>` `<mark>` `<sub>` `<sup>` `<br />`. Every block tag is an
item of its own, so it can be revealed or animated alone.

**Presenter notes.** `<notes>…</notes>` becomes notes in the presenter window.

## Slide settings

`hidden: true` leaves a slide out of the show, the drawer and the PDF while it stays in the folder (handy for drafts and backup slides).

An optional `<slide>` block anywhere in the file (usually at the top), one `key: value` per line, `#` starts a comment:

```text
<slide>
  layout: cover         # a title slide: no header or footer, a large heading
  theme: light          # theme for this slide only
  background: img.jpg   # an image or a looping muted video (clip.mp4) relative to the .slide file, or any CSS: "linear-gradient(...)", "#123"
  halign: center        # start | center | end (default start): where the content sits horizontally, and how text is aligned
  valign: center        # start | center | end (default start): where the content sits vertically
  justify: true         # justified paragraphs (the last line stays at the start)
  class: my-class       # extra CSS class on the stage
  title: Custom title   # title shown in the presenter view
  transition: slide     # how the slide's content comes in: fade | slide | slide-right | slide-left | zoom | none (none = a hard cut)
  section-transition: slide-right   # the same, for the swaps between the <section>s of the slide (default: transition)
  stagger: 0.1          # seconds between consecutive text elements
  margin: 6vmin         # space around the content (default 3vmin 40px 4vmin); gap and col-gap: between the parts
  heading-size: 56      # also text-size, spacing (gap between blocks)
  accent: #ffb454       # also heading-color, text-color
  footer: off           # hide the deck's footer / header on this slide (header: off)
  --accent: #ff9e64     # any CSS variable, for this slide only (--move-dur, --ease, --tok-keyword, --font-heading, ...)
</slide>
```

## Deck configuration (`deck.json`)

Optional, placed in the deck folder:

```json
{
  "title": "My talk",
  "theme": "ocean",
  "css": "deck.css",
  "vars": { "--font-heading": "Georgia, serif" },
  "defaults": { "justify": "true", "padding": "9vmin 12vmin" },
  "code": { "bg": "panel", "lines": true, "radius": 10 },
  "columns": { "valign": "center" },
  "textOnly": { "halign": "center", "valign": "center" },
  "footer": { "left": ["logo.svg", "ACME Corp"], "right": "{slide} / {slides}", "height": 42, "border": true },
  "themes": {
    "ocean": { "--bg": "#0b1d2a", "--fg": "#b8d4e3", "--accent": "#3ddc97", "--tok-keyword": "#ff7eb6" }
  },
  "fonts": [{ "family": "Fira Code", "src": "fira.woff2", "weight": "400" }],
  "googleFonts": ["Inter:wght@400;700"],
  "animation": {
    "move": 0.5, "fade": 0.3, "moveDelay": 0.05, "fadeInDelay": 0.1,
    "ease": "ease-in-out", "slideFade": 0.4,
    "textTransition": "slide", "textStagger": 0.12, "textDrift": 8
  }
}
```

| Key | Purpose |
| --- | --- |
| `title`, `theme` | deck title; theme used at start (`dark`, `light`, `paper` or one of yours) |
| `schemes` | `{ "light": "ink", "dark": "midnight" }`: the themes for light and dark mode. The deck starts in the one matching the OS (or the hub's light/dark toggle), and its card in the hub follows the toggle; `theme` is the fallback |
| `author`, `date`, `order` | shown on the deck's card in the gallery; `order` sorts the cards |
| `autoplay`, `loop` | `"autoplay": 5` plays the deck by itself, a step every 5 s (a slide's own `autoplay:` setting sets its pace); `"loop": true` starts over at the end. Also `?autoplay=5&loop` in the URL, or the `a` key |
| `hidden`, `thumbnail` | `"hidden": true` keeps the deck out of the gallery (it stays reachable with `?deck=name`); `"thumbnail": "cover.png"` shows an image instead of the live first slide |
| `css` | extra stylesheet, relative to the deck folder |
| `vars` | CSS variables applied to the whole deck |
| `defaults` | settings applied to every slide (a slide's own settings win), e.g. `layout`, `halign`, `justify`, `heading-size` |
| `code` | look of every code block (a block's own options win): `bg` (`"panel"`, `"none"` or a color), `lines` (line numbers), `radius`, `pad` |
| `columns` | like `defaults`, but only for slides with a `<row>` of several parts, e.g. `{"valign": "center"}` |
| `textOnly` | like `defaults`, but only for slides without code (a single column of text, covers included), e.g. `{"halign": "center", "valign": "center"}` |
| `header`, `footer` | a bar on every slide with `left`, `center`, `right` slots holding text and/or images (a logo); also `height`, `background`, `color`, `border`, `cover` (show on cover slides too). Text takes `{slide}` `{slides}` `{title}` `{slideTitle}` `{author}` `{date}` |
| `themes` | custom themes as CSS variables; they join the `t` key cycle |
| `fonts` | local font files (relative to the deck folder) |
| `googleFonts` | families fetched from Google Fonts (needs network) |
| `animation` | durations in seconds, easing, text entrance and stagger |

Themes are plain CSS variables (`--bg`, `--fg`, `--heading`, `--muted`, `--accent`, `--code-bg`, `--tok-*`
for token colors, `--font-text`, `--font-heading`, `--font-code`, ...). See `src/style.css` for the full list.
Two complete custom themes (`sunset`, `terminal`) live in `examples/theming/deck.json`.

## Writing decks with an LLM

The site also serves `llms.txt` (a compact syntax reference and instructions for models) and `llms-full.txt` (this README plus every slide of the manual decks). Give a model the URL, describe your talk, and ask for a deck folder: one `.slide` per slide plus a `deck.json`. For example:

> Read https://geraldserafin.github.io/md-slides/llms.txt, then write me a 10-slide deck about how Git branches work, with a code example that changes step by step.

`npm run llms` writes both files into `dist/` (the Pages workflow does it on every push).

## Build targets

`slides build <deck...> [-o out] [-t static|single|pdf|exe] [--steps] [--base /path/]`

| Target | Output | Notes |
| --- | --- | --- |
| `static` (default) | a folder | works under any sub-path (`--base` overrides the prefix); `-o dist` by default |
| `single` | one `.html` file | JS, CSS, fonts, images, video and only the grammars the deck uses are inlined as `data:` URIs; works offline and from `file://`. Large videos grow by about a third (base64) |
| `pdf` | `.pdf` | one page per slide (final state); `--steps` gives one page per animation step. Needs Chromium/Chrome (`CHROMIUM=/path/to/chrome`, otherwise looked up in `PATH`). With several decks, `-o` is a directory |
| `exe` | executable | Node single-executable binary (~90 MB) with the deck embedded; starts a local server and opens the browser (`--port N`, `--no-open`). Built for the **current** platform only; use a CI matrix for others (see [release workflow](.github/workflows/release.yml)). On macOS sign it: `codesign --sign - app` |

PDF export is also available from any browser: open `?print=slides` or `?print=steps` and use *Print*.

`slides dev <deck...> [--port N] [--open]` starts a dev server that restages the deck and reloads the
page whenever a file in the deck folder changes.

## Viewer controls

| Key | Action |
| --- | --- |
| `→` `Space` `PageDown` `Enter` | next step |
| `←` `PageUp` `Backspace` | previous step |
| `Home` / `End` | first / last step |
| `o` | slide drawer: thumbnails of all slides on the left, current one highlighted, click to jump (also the ☰ button on mouse move); `Esc` closes |
| `t` | cycle themes (remembered per browser) |
| `p` | presenter window, laid out like PowerPoint's: timer, slide counter, clock and *End show* on top; the current slide big on the left with ← → under it; the next slide and the notes (A− A+, or `+`/`-`) on the right. The previews are live and either window can drive |
| `b` or `.` | black screen (press again to bring the slide back) |
| `f` | fullscreen |
| `l` | laser pointer: a glowing dot with a short tail follows the mouse |
| `d` | draw on the slide (`c` clears, `Esc` stops; the ink goes away when the slide changes) |
| `z` | 2× magnifier around the pointer |
| `a` | autoplay: step every few seconds until you press a key or click |
| `h` or `?` | help |

Moving the mouse reveals two buttons: ☰ in the top left (the slide drawer) and a toolbox in the top right. The toolbox is one button that unfolds the presenter window, fullscreen, theme, laser, draw, magnifier, autoplay and help (the active tools are highlighted; `Esc` or a click on the slide folds it).

**Phones and tablets.** The viewer works with touch: tap the right three quarters of the screen for the next step and the left quarter for the previous one, or swipe; a touch reveals the ☰ and toolbox buttons (bigger on touch screens), and the slide drawer covers the slide instead of squeezing it on a narrow screen. Text and code are sized to the screen (in portrait the slide is a tall column; landscape looks like a small desktop), notches are respected, and the chooser and the presenter view (stacked: slide, arrows, next slide, notes) adapt to narrow screens.

Other ways to navigate: click (left quarter = back), swipe on touch screens, `#<step>` in the URL (deep link),
`?theme=light|dark|paper|<yours>`, `?deck=<name>`.

## Adding a language

1. Add the language tags (the `lang=` values) to `src/tags.json` (`"kt": "kotlin"`).
2. Add the grammar name to the glob in `src/main.ts` (grammars come from the
   [`tree-sitter-wasms`](https://www.npmjs.com/package/tree-sitter-wasms) package).
3. Optionally map node types to token classes in `src/tokens.ts`.

Built in: TypeScript, TSX, JavaScript, C, C++, Python, Rust, Go, Java, Bash, JSON, HTML, CSS, Lua. (YAML is excluded: the grammar in `tree-sitter-wasms` crashes with this runtime.)

## How the diff works

For every pair of consecutive frames of a code group the viewer matches the two syntax trees and renders the match.
The matcher (`src/gumtree.ts`) is GumTree plus a few extra cues that reduce false matches:

1. **Top-down** (height ≥ 2): identical subtrees, tallest first. Identical pairs sitting in *different
   slots* are deferred when one side has its own same-slot partner (e.g. a function body vs. an identical
   block nested in a new `try`).
2. **Bottom-up**: containers are matched by Dice similarity of their already-matched descendants (≥ 0.5),
   then children are recovered with an LCS.
3. **Extra cues**: the text of identity-bearing leaves (identifiers, literals), position in the file,
   the *slot* (identical path of node types and indices from the root), a support check on the parent
   pair, and a relocation pass for fragments that moved as a whole.
4. **Leaf pass**: a unique identity leaf inside a matched pair of containers is matched even if the
   structure around it changed.

Matching is language-agnostic: it works on a plain `{ label, text, children }` tree, so adding a language
never touches the matcher. Token identities are propagated backwards through the whole step sequence,
so the same token is the same DOM element across all steps and can be animated with CSS transitions.

## Development

```sh
npm install
npm run dev          # dev server for examples/
npm run build        # typecheck + static build of examples/ into dist/
npm test             # unit tests + GumTree regression fixtures
npm run typecheck
```

A Nix/devenv shell with Node and Chromium is provided (`devenv shell`).

Layout:

```
cli/        the `slides` compiler (dev, build, targets)
src/        the viewer (browser): parsing, GumTree, layout, renderer, themes, drawer, chrome (header/footer), presenter
tests/      vitest suites; tests/fixtures/ has matcher regression cases (old.*, new.*, expect.txt)
examples/   demo decks used for development and GitHub Pages
```

Matcher regressions are easiest to add as fixtures: put `old.<ext>`, `new.<ext>` and an `expect.txt` in a new
folder under `tests/fixtures/` (the directive format is described at the top of
`tests/match-regression.test.ts`).

## License

BSD-3-Clause, see [LICENSE](LICENSE).
