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

**Animated code.** A fenced block in a supported language becomes animated code. Consecutive blocks of
the same language and the same classes are *frames* of one animation:

````markdown
## Step 1

```ts
function total(items: number[]) {
  let sum = 0;
  for (const x of items) sum += x;
  return sum;
}
```

```ts
function total(items: number[]) {
  return items.reduce((sum, x) => sum + x, 0);
}
```
````

Tabs in code are expanded to four spaces. Pressing → plays the transition from the first block to the second. Text before a code block belongs to
that block's section. A section without code is centered on screen (a title slide). Blocks in
languages without a grammar are shown as static code.

**Fence options** go after the language: ` ```cpp .left size=18 fit=none `

| Option | Meaning |
| --- | --- |
| `.left` `.center` `.right` | horizontal alignment of the code block (default: centered, left in the side layouts) |
| `.top` `.middle` | vertical alignment; code is centered vertically in its area by default, `.top` pins it to the top |
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

**Presenter notes.** HTML comments (`<!-- like this -->`) become notes in the presenter window.

## Slide front matter

An optional block at the top of a `.md` file:

```yaml
---
layout: side          # side | side-right | cover (default: text above code)
theme: light          # theme for this slide only
background: img.jpg   # an image (relative to the .md) or any CSS: "linear-gradient(...)", "#123"
valign: center        # force vertical centering
class: my-class       # extra CSS class on the stage
title: Custom title   # title shown in the presenter view
transition: slide     # text entrance: fade | slide | slide-left | zoom | none
stagger: 0.1          # seconds between consecutive text elements
align: justify        # text alignment: left | center | right | justify (headings follow unless heading-align is set)
heading-align: left   # left | center | right
heading-size: 56      # also text-size, spacing (gap between blocks), padding, split (text column in side layouts)
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
  "defaults": { "align": "left", "heading-align": "left" },
  "footer": { "left": ["logo.svg", "ACME Corp"], "right": "{slide} / {slides}", "height": 42, "border": true },
  "themes": {
    "ocean": { "--bg": "#0b1d2a", "--fg": "#b8d4e3", "--accent": "#3ddc97", "--tok-keyword": "#ff7eb6" }
  },
  "fonts": [{ "family": "Fira Code", "src": "fira.woff2", "weight": "400" }],
  "googleFonts": ["Inter:wght@400;700"],
  "animation": {
    "move": 0.5, "fade": 0.3, "moveDelay": 0.05, "fadeInDelay": 0.1,
    "ease": "ease-in-out", "slideFade": 0.4,
    "textTransition": "slide", "textStagger": 0.12
  }
}
```

| Key | Purpose |
| --- | --- |
| `title`, `theme` | deck title; theme used at start (`dark`, `light`, `paper` or one of yours) |
| `author`, `date`, `order` | shown on the deck's card in the gallery; `order` sorts the cards |
| `hidden`, `thumbnail` | `"hidden": true` keeps the deck out of the gallery (it stays reachable with `?deck=name`); `"thumbnail": "cover.png"` shows an image instead of the live first slide |
| `css` | extra stylesheet, relative to the deck folder |
| `vars` | CSS variables applied to the whole deck |
| `defaults` | front matter applied to every slide (a slide's own front matter wins), e.g. `align`, `heading-size`, `layout` |
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

For every pair of consecutive code blocks the viewer matches the two syntax trees and renders the match.
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
