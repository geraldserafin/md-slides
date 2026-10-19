# slides

Markdown presentations where **code transitions are animated by an AST diff**.

Write your slides as plain Markdown. When one code block is followed by an edited copy of itself,
the viewer parses both with [tree-sitter](https://tree-sitter.github.io/), matches the two syntax trees
with [GumTree](https://hal.science/hal-01054552), and animates the result: unchanged tokens stay,
moved tokens glide to their new place, removed ones fade out, new ones fade in.

`slides` is a compiler: it turns a folder of Markdown files into a static website, a single
self-contained HTML file, a PDF, or a standalone executable.

```sh
npx slides dev my-talk/                 # dev server with live reload
npx slides build my-talk/ -o dist       # static website (GitHub Pages, Netlify, ...)
npx slides build my-talk/ -t single     # one .html file, works offline
npx slides build my-talk/ -t pdf        # PDF
npx slides build my-talk/ -t exe        # standalone executable
```

> Until the package is published, run the CLI from a clone: `node cli/slides.mjs <command> ...`.

## Contents

- [Quick start](#quick-start)
- [Writing slides](#writing-slides)
- [Slide front matter](#slide-front-matter)
- [Deck configuration](#deck-configuration-deckjson)
- [Build targets](#build-targets)
- [Viewer controls](#viewer-controls)
- [Adding a language](#adding-a-language)
- [How the diff works](#how-the-diff-works)
- [Development](#development)

## Quick start

Requirements: Node.js 22+ (the `pdf` target also needs Chromium or Chrome).

```sh
git clone <this repo> && cd slides
npm install
npm run dev            # serves everything in examples/ with live reload
```

A deck is a folder; each `.md` file in it (sorted by name) is one slide:

```
my-talk/
  01-intro.md
  02-refactoring.md
  deck.json          # optional configuration
  diagram.svg        # assets are referenced relative to the .md file
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
| `footer` | a line of small text at the bottom |
| `theme` | start theme: `dark`, `light`, `paper` or one of your own `themes` (a visitor's saved choice wins) |
| `schemes` | `{ "light": ..., "dark": ... }`: your own themes for the toggle to switch between (default: the built-in `light` and `dark`) |
| `themes`, `fonts`, `googleFonts`, `css` | like in `deck.json`: your own colors, fonts and an extra stylesheet for the page |
| `align` | `start` (default) or `center` for the header and footer |
| `cardWidth` | minimum card width in px (default 340) |
| `show` | what the line under a card title lists, from `author`, `date`, `slides` (default all three) |
| `order` | deck folder names, first to last; the others follow in their usual order |
| `colorToggle` | `false` hides the light/dark button |

## Examples

`examples/` has four decks you can read as templates (two are `hidden` from the gallery for now). Start with **`guide`**, a ~60-slide manual (about 150 steps) that is
itself a deck: every feature has a live demonstration on the slide that describes it.

| Deck | Shows |
| --- | --- |
| `guide` | the complete guide: sections and frames, every kind of edit, the supported languages, `focus=`, fit/size, rich text, images, video, layouts, per-slide themes/backgrounds/colors, slow-motion and bouncy animation, `deck.json`, controls, export, build targets, deployment |
| `refactoring` | TypeScript: types, naming, functional style, Extract Method. A dark "midnight" look with Computer Modern fonts |
| `python-idioms` | loops → comprehensions, `Counter`, dataclasses, `with`; light "paper" theme |
| `monads` | C++: error codes → exceptions → `optional` → `expected` |

## Writing slides

Normal Markdown (headings, paragraphs, lists, quotes, inline code) plus a few conventions.

**Sections.** A slide (one `.md` file) splits into sections at a `#` or `##` heading. Moving to the next section fades
the old text and code out and the new ones in. Inside a section you write text, images and code in reading order.

**Animated code.** A fenced block in a supported language is an animated code block. Blocks are **independent** unless
they share an id: `#name` after the language. Blocks with the same id are the *frames* of one animation, in the same
place, one click each; the diff between two frames is what moves:

````markdown
## Step 1

```ts #total
function total(items: number[]) {
  let sum = 0;
  for (const x of items) sum += x;
  return sum;
}
```

```ts #total
function total(items: number[]) {
  return items.reduce((sum, x) => sum + x, 0);
}
```

```py
print("a block of its own, shown right below")
```
````

A group id can continue across sections and slides (the same id in the next section morphs the code there). Without an id
a block is shown as it is, and you can have as many as you like on a slide, with text in between. Tabs are expanded
to four spaces. Blocks in languages without a grammar are shown as static code.

**Reveal.** A line with three plus signs, `+++`, hides everything after it until the next click, like PowerPoint's
build-in animations. It works for text, lists, images, video and code blocks, and nothing moves when the content appears
(its space is reserved). Write `{.steps}` on a line after a list to show it bullet by bullet:

````markdown
## Plan

The first point is there from the start.

+++

The second appears on a click.

+++

```ts
const third = "a code block on the last click";
```
````

**Rows and columns.** A slide is one column by default (title, text, code, from the top left). A line with three dashes,
`---`, starts a new **row**; a line with three bars, `|||`, starts a new **cell** in the row. Any combination works: two
columns, three, a title row above two cells, a 2 × 2 grid. Every cell holds text, images and code blocks, and code in any
cell is animated:

````markdown
## What the diff does       <- row 1: a title

---

### rename                  <- row 2, cell 1
```ts #r
...
```

|||

### insert                  <- row 2, cell 2
```ts #i
...
```

---

### delete                  <- row 3 ...
````

Leave a blank line around `---` and `|||` (right after a line of text `---` would turn it into a heading). Sizes come from the
front matter: `cols: 1fr 2fr` (cell widths, every row), `rows: auto 1fr` (row heights), `split: 40%` (two cells). By default
cells are equal and a row is as tall as its content (a single row fills the slide). Alignment inside the cells is `valign` /
`halign` (see below). Code blocks in cells next to each other share one font size.

**Cell options and `grid:`.** Options go after the bars: `||| span=2` (twice as wide), `||| halign=end valign=center`
(at the start of a cell, after a `---`, they apply to that cell). `grid: 3` in the front matter wraps the cells into rows
of three, so a grid is just a list of `|||` cells.

**A slide with a head (a sub-presentation).** A level 1 heading at the start of a slide, with `##` sections after it,
is the slide's *head*: it stays on screen while the sections below swap one after another. Use it for a title with several
examples that you present one at a time:

````markdown
# What the diff does       <- stays

Six kinds of edit, one at a time.

## rename                  <- section 1 (then → plays its code, → again for the next)
...
## insert                  <- section 2
````

**Clicks across cells.** `@1` on a fence puts that frame on click 1 instead of the next free one, so every group with an
`@1` frame advances on the same click; `+++ 3` puts what follows on click 3:

````markdown
```ts #r
function area(r) {}
```

```ts #r @1
function circleArea(radius) {}
```
````

**Fence options** go after the language: ` ```cpp #fn .lines size=18 `

| Option | Meaning |
| --- | --- |
| `halign=start\|center\|end` (or `.left` `.center` `.right`) | horizontal position of the code block in its area; default: the slide's `halign` (start) |
| `valign=start\|center\|end` (or `.top` `.middle` `.bottom`) | vertical position of the code block in its area; default: the slide's `valign` (start) |
| `#name` | the group: blocks with the same id are the frames of one animation |
| `@1` | the click this frame appears on (default: the next one); `@1` on frames of several groups = one click for all |
| `.lines` / `.nolines`, `start=10` | line numbers, and the number of the first line |
| `.panel` (or `.bg`) / `.nopanel`, `bg=#16213e`, `radius=12`, `pad="1em 1.4em"` | a background box around the code; `bg=` sets its color (and switches it on) |
| `title="cart.ts"` | a caption above the code, e.g. a file name |
| `size=18` | fixed font size in px |
| `fit=none` | disable automatic scaling to the available space |
| `focus=2-4,7` | keep these lines (1-based) bright and dim the rest; set it per frame to walk through code |
| `transition=morph\|fade\|none` | how *this frame* is entered from the previous one: the diff animation (default), a plain cross-fade, or a hard cut |

The font size is fitted to the largest frame of a section and stays constant across its frames.

**Images and video.** A paragraph that contains only an image or video:

```markdown
![diagram](diagram.svg){.left width=420px}
![](clip.mp4){autoplay loop muted}
```

Paths are relative to the `.md` file. Videos are recognized by extension (`mp4`, `webm`, `ogv`, `mov`, `m4v`).

**Animating one element.** A line `{anim=zoom delay=0.2}` right after an item (blank line between) sets how it comes in: `anim` is `fade`, `rise` (default), `zoom`, `left`, `right`, `down`, `blur`, `pop` or `none`; `delay` and `dur` are seconds; `at=2` puts it on click 2 (instead of a `+++`) and `out=4` makes it leave again on click 4. It works on text, images, tables, code blocks and diagrams.

**Morph for anything.** Code morphs by itself; any other item can too. Items with the same id, written `{morph=logo}` after them, glide from their place on the section (or slide) that leaves to their place on the one that arrives, scaling as they go; if their content changed it cross-fades on the way. Images with the same file match automatically (`{morph=none}` turns that off).

**Math.** `$x^2$` inline and `$$ ... $$` as a block are rendered with [KaTeX](https://katex.org) (plain HTML, so it works in every target and in the PDF). A dollar sign next to a space or a digit stays a dollar sign (`$5 and $6`). Math follows the slide's alignment and reveals like any item.

**Diagrams.** A `mermaid` fence draws a [Mermaid](https://mermaid.js.org) diagram in the slide's colors (it is redrawn when the theme changes); fence options work like on images (` ```mermaid width=70% `). The library is loaded on first use and left out of builds whose decks have no mermaid fence.

**Presenter notes.** HTML comments (`<!-- like this -->`) become notes in the presenter window.

## Slide front matter

`hidden: true` leaves a slide out of the show, the drawer and the PDF while it stays in the folder (handy for drafts and backup slides).

An optional block at the top of a `.md` file:

```yaml
---
layout: cover         # a title slide (the old side / side-right still work: text left + code right, or the reverse)
theme: light          # theme for this slide only
background: img.jpg   # an image (relative to the .md) or any CSS: "linear-gradient(...)", "#123"
halign: center        # start | center | end (default start): where the content sits horizontally, and how text is aligned
valign: center        # start | center | end (default start): where the content sits vertically
justify: true         # justified paragraphs (the last line stays at the start)
class: my-class       # extra CSS class on the stage
title: Custom title   # title shown in the presenter view
transition: slide     # how the slide's content comes in: fade | slide | slide-right | slide-left | zoom | none (none = a hard cut)
section-transition: slide-right   # the same, for the swaps between the ## sections of the slide (default: transition)
stagger: 0.1          # seconds between consecutive text elements
heading-size: 56      # also text-size, spacing (gap between blocks), padding, split (width of the left cell, default equal), cols, rows (grid track sizes)
accent: #ffb454       # also heading-color, text-color
footer: off           # hide the deck's footer / header on this slide (header: off)
--accent: #ff9e64     # any CSS variable, for this slide only (--move-dur, --ease, --tok-keyword, --font-heading, ...)
---
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
| `autoplay`, `loop` | `"autoplay": 5` plays the deck by itself, a step every 5 s (a slide's own `autoplay:` front matter sets its pace); `"loop": true` starts over at the end. Also `?autoplay=5&loop` in the URL, or the `a` key |
| `hidden`, `thumbnail` | `"hidden": true` keeps the deck out of the gallery (it stays reachable with `?deck=name`); `"thumbnail": "cover.png"` shows an image instead of the live first slide |
| `css` | extra stylesheet, relative to the deck folder |
| `vars` | CSS variables applied to the whole deck |
| `defaults` | front matter applied to every slide (a slide's own front matter wins), e.g. `layout`, `halign`, `justify`, `heading-size` |
| `code` | look of every code block (a block's own options win): `bg` (`"panel"`, `"none"` or a color), `lines` (line numbers), `radius`, `pad` |
| `columns` | like `defaults`, but only for the classic two-column slide (one row, several cells with `|||`), e.g. `{"valign": "center"}`; grids of several rows use `defaults` |
| `textOnly` | like `defaults`, but only for slides without code (a single column of text, covers included), e.g. `{"halign": "center", "valign": "center"}` |
| `header`, `footer` | a bar on every slide with `left`, `center`, `right` slots holding text and/or images (a logo); also `height`, `background`, `color`, `border`, `cover` (show on cover slides too). Text takes `{slide}` `{slides}` `{title}` `{slideTitle}` `{author}` `{date}` |
| `themes` | custom themes as CSS variables; they join the `t` key cycle |
| `fonts` | local font files (relative to the deck folder) |
| `googleFonts` | families fetched from Google Fonts (needs network) |
| `animation` | durations in seconds, easing, text entrance and stagger |

Themes are plain CSS variables (`--bg`, `--fg`, `--heading`, `--muted`, `--accent`, `--code-bg`, `--tok-*`
for token colors, `--font-text`, `--font-heading`, `--font-code`, ...). See `src/style.css` for the full list.
Two complete custom themes (`sunset`, `terminal`) live in `examples/guide/deck.json`.

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
| `p` | presenter window: notes, timer, next slide |
| `f` | fullscreen |
| `l` | laser pointer: a glowing dot with a short tail follows the mouse |
| `d` | draw on the slide (`c` clears, `Esc` stops; the ink goes away when the slide changes) |
| `z` | 2× magnifier around the pointer |
| `a` | autoplay: step every few seconds until you press a key or click |
| `h` or `?` | help |

Other ways to navigate: click (left quarter = back), swipe on touch screens, `#<step>` in the URL (deep link),
`?theme=light|dark|paper|<yours>`, `?deck=<name>`.

## Adding a language

1. Add the fence tags to `src/tags.json` (`"kt": "kotlin"`).
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
