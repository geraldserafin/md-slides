# slideit

Presentations where **code transitions are animated by an AST diff**, written in a small language (KDL).

Write your slides in a `.slides` file. When a code block goes through several states,
the viewer parses both with [tree-sitter](https://tree-sitter.github.io/), matches the two syntax trees
with [GumTree](https://hal.science/hal-01054552), and animates the result: unchanged tokens stay,
moved tokens glide to their new place, removed ones fade out, new ones fade in.

`slideit` is a compiler: it turns a `.slides` file (or a folder of them) into a static website, a single
self-contained HTML file, a PDF, or a standalone executable.

```sh
npm i -g @geraldserafin/slideit          # installs the `slides` command (`slideit` works too; one-off: npx @geraldserafin/slideit ...)

slides new my-talk                      # a starter deck: cover, bullets, animated code, ending
slides check my-talk/                   # find mistakes (file:line:col: message)
slides dev my-talk/                     # dev server with live reload
slides build my-talk/ -o dist           # static website (GitHub Pages, Netlify, ...)
slides build my-talk/ -t single         # one .html file, works offline
slides build my-talk/ -t pdf            # PDF
slides build my-talk/ -t exe            # standalone executable
```

Other ways to get it:

```sh
bunx @geraldserafin/slideit new my-talk   # bun: bunx / bun add -g @geraldserafin/slideit
nix run github:geraldserafin/md-slides -- new my-talk   # nix (a nixpkgs package is planned, see nix/README.md)
brew install geraldserafin/tap/slideit  # Homebrew
```

> Until the package is published, run the CLI from a clone: `node cli/slideit.mjs <command> ...` (it builds the viewer on the fly).

## Contents

- [Quick start](#quick-start)
- [Writing slides](#writing-slides)
- [Slide properties](#slide-properties)
- [Deck configuration](#deck-configuration)
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

A deck is a folder with one `.slides` file (or several: they are read in the order of their names, and a big deck can be split that way):

```
my-talk/
  my-talk.slides
  deck.json          # optional configuration (the same as a `deck` node)
  diagram.svg        # assets are referenced relative to the .slides file
```

`slides dev` and `slides build` accept one or more deck folders, or a folder of deck folders.
With a single deck the viewer opens it directly; with several it shows a **gallery**: a card per deck with a
live thumbnail of its first slide, the title and a line with author, date and the number of slides. The gallery follows the OS light/dark mode and has a toggle (every animation step counts as a slide, as it does for the audience).
Make the first slide a cover with a `background` and the card looks good.

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
| `writing` | the language: nodes and strings, layouts, clicks, text and media, math, charts, diagrams, own layouts, per-element animation |
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

A deck is written in **`.slides`** files, in [KDL](https://kdl.dev): a small language of **nodes**. A node has a name, arguments,
`key=value` properties, flags (bare words) and children in braces. Text goes in quotes, with a little inline markup inside. A file
holds a `deck` node (optional settings), `layout` nodes (your own layouts, optional) and many `slide` nodes:

````kdl
// my-talk.slides
deck title="My talk" author="Me" theme=dark

slide {
  title "Plan"
  text "The **first** point is there from the start, with `code` and [links](https://example.com)."
  list steps {                 // one bullet per click
    - "one"
    - "two"
  }
  notes "Say this out loud."
}

slide {
  title "Code that moves"
  swap {                       // one thing at a time; code in a swap: the diff between the states is what moves
    code "ts" "let total = 0;"
    code "ts" "let total = items.length;"
  }
}
````

Where a node has several children write them on separate lines, or on one line with `;` between them. A string can sit on several
lines with `"""`, and a raw string `#"…"#` has no escapes (good for code and LaTeX). `//` starts a comment and `/-` in front of a node
switches the whole node off. A syntax error is reported with its line (`slides check`, the editor, the viewer's error screen).

**Layouts.** You write what is on the slide; its layout follows from the content, or you name one:

| On the slide | Layout |
| --- | --- |
| only a `title` (and `text`), the first slide | `cover` |
| only a `title` | `section` |
| `title`, `text`, `list`… | `default` |
| text and one image | `image-right` |
| several images | `gallery` |
| text and animated code | `code-side` |
| only a `quote` | `quote` |

Built in: `default` `cover` `section` `center` `quote` `full` `two-cols` (`left`, `right`) `three-cols` (`left`, `middle`, `right`)
`image-left` `image-right` `gallery` `code` `code-side`. Name one with `slide layout=two-cols`, then put content in the slots:

```kdl
slide layout=two-cols columns="1 2" {
  title "Before and after"
  left { text "Before" }
  right { code "ts" "let x = 1;" }
}
```

**Your own layouts** are rows and columns with `slot`s; any `.slides` file of the deck may define them:

```kdl
layout "sidebar" {
  row {
    col size="28%" { slot "side" }
    col { slot }                 // a slot without a name: everything that is in no slot
  }
}

slide layout=sidebar {
  side { text "Narrow" }
  text "Wide"
}
```

For full control build the shape in the slide with `row` (children side by side), `col` (stacked) and `grid columns=3`. `size` on a
part is a weight (`size=2`), `auto` or a length (`size="40%"`); `align` (`left` `center` `right`), `valign` (`top` `middle`
`bottom`) and `gap` shape the parts.

| Node | Does | Arguments, flags, properties |
| --- | --- | --- |
| `slide` | one slide | `layout` `columns` `align` `valign` `theme` `background` `transition` `animate` `hidden` `autoplay` `header` `footer` `title` `justify` `class` `--css-var=…` |
| `title` `heading` `subheading` `text` | a heading, a paragraph; one item each | the text; `size="small"\|"large"` `align` `valign` `anim` `id` |
| `list` with `-` items | a list, nested by putting a `list` in an item | `numbered` `steps` `start=3` |
| `quote` | a quote with an accent bar | the text, `by="who"` |
| `table` with `head` and `-` | a table | the cells as arguments |
| `math` | display math (KaTeX); inline is `$x^2$` in a text | the formula |
| `code` | a block of code; several `code`s in a `swap` are the states of one animated block | the language and the code, flags `lines` `nolines` `nopanel`, `id` `from` `title` `start` `size` `fit` `focus` `transition` `bg` `radius` `pad` `align` `valign` |
| `image` `video` `audio` | media, relative to the file | the file; `alt` `width` `height` `align`; flags `autoplay` `loop` `muted` `nocontrols` |
| `chart` | CSV as an SVG chart | `"bar"` `"line"` `"pie"`, the CSV, `title` `width` |
| `diagram` | a Mermaid diagram | the source, `width` |
| `row` `col` `grid` | layout | `size` `gap` `align` `valign` `class` `columns` |
| `swap` | shows one child at a time, all in one place; a click brings the next | `anim` `size` `align` `valign`; for code: `autoplay=2`, flag `loop` |
| `step` `pause` | reveal on a click | `anim` |
| `notes` | presenter notes | the text |

**Text.** Inside the quotes: `**bold**` `*italic*` `~~strike~~` `==mark==` `H~2~O` `x^2^` `` `code` `` `[link](url)` `$tex$` `[[Key]]`; a
newline is a line break; a backslash escapes a special character (`\*`). Nothing else is special, so `snake_case`, `a * b` and `<`
stay as they are.

**Animated code.** `code "ts" "let a = 1;"` is a block of code. Put several in a `swap` and they are the states of one animated
block: the first is there with the block, each next one takes a click, and the diff between two states is what moves (the options
of the block are the first `code`'s; `focus` and `transition` are each state's own). Blocks are **independent** unless they share an `id`:
the same `id` on another slide, or in another child of a `swap`, continues the animation from the last state it showed.
`code from="total"` shows a copy of the last state of the earlier block with that id. Tabs are expanded to four spaces; a language
without a grammar is shown as static code.

| Property | Meaning |
| --- | --- |
| `align` `valign` | where the block sits in its area |
| `id=name` | the animation: blocks with the same id continue each other; also a target for `from` |
| `lines`, `nolines`, `start=10` | line numbers, and the number of the first line |
| `nopanel`, `bg="#16213e"`, `radius=12`, `pad="1em 1.4em"` | the box around the code |
| `title="cart.ts"` | a caption above the code |
| `size=18` | fixed font size in px |
| `fit=none` | disable automatic scaling to the available space |
| `focus="2-4,7"` | keep these lines bright and dim the rest; on each `code` of a swap to walk through code |
| `transition=morph\|fade\|none` | how *this state* is entered: the diff animation (default), a cross-fade, or a cut |
| `swap autoplay=1 loop` | the states play by themselves, 1 s apart; with `loop` forth and back without end. They take no clicks |

**Reveal.** `pause` holds back everything after it (in the same container) until the next click; `step { … }` does it for what is
inside; `list steps` shows a list bullet by bullet. Nothing moves when the content appears (its space is reserved). `anim=` on any
node (`fade`, `rise`, `zoom`, `left`, `right`, `down`, `blur`, `pop`, `none`) says how it comes in.

**Swap.** `swap { … }` shows one of its children at a time, all in the same place (the size of the biggest), and what is outside
it stays: a title with several examples that you present one at a time. A child with several things is a `col`. `anim=left` says how
the next one comes in. A `swap` can sit in one column of a `row`. Give any node an `id` to glide it from one slide (or child) to
the next; images with the same file match on their own, and `code` with the same `id` morphs.

**Math, charts, diagrams.** `$x^2$` in a text is inline math and a `math` node is display math, rendered with [KaTeX](https://katex.org)
(plain HTML: it works in every target and in the PDF). `chart "bar"` turns CSV lines into an SVG chart in the slide's colors (the
first row names the series); `diagram` draws a [Mermaid](https://mermaid.js.org) diagram, redrawn when the theme changes. The library
is loaded on first use and left out of builds whose decks have no `diagram`.

**Presenter notes.** `notes "…"` becomes the notes in the presenter window.

## Slide properties

| Property | Meaning |
| --- | --- |
| `layout=cover` | a built-in or own layout (default: chosen from the content) |
| `columns="1 2"` | proportions of the columns of a column layout |
| `theme=light` | the theme for this slide only |
| `background="img.jpg"` | an image or a looping muted video relative to the file, or any CSS: `"linear-gradient(…)"`, `"#123"` |
| `align=center` `valign=middle` | where the content sits, and how text is aligned (`left` `center` `right`, `top` `middle` `bottom`) |
| `justify=#true` | justified paragraphs |
| `transition=slide` | how the content comes in: `fade` `slide` `slide-right` `slide-left` `zoom` `none` |
| `hidden=#true` | left out of the show, the drawer and the PDF; stays in the file |
| `autoplay=3` | seconds per step when the deck plays itself |
| `header=off` `footer=off` | hide the deck's bars here |
| `title="Short"` | the title in the presenter view and the drawer |
| `class=my-class` | an extra CSS class on the stage |
| `--accent="#ff9e64"` | any CSS variable, for this slide only (`--text-size`, `--heading-size`, `--move-dur`, `--tok-keyword`, `--font-heading`…) |

## Deck configuration

Settings of the whole deck go in a `deck` node at the top of a `.slides` file (and, if you like JSON, in `deck.json` next to it; where both say
something, the `deck` node wins):

````kdl
deck title="My talk" author="Me" theme=ocean {
  css "deck.css"
  vars --font-heading="Georgia, serif"
  defaults justify=#true margin="9vmin 12vmin"
  code-style bg=panel lines=#true radius=10
  footer left="logo.svg" right="{slide} / {slides}" height=42 border=#true
  themes {
    ocean --bg="#0b1d2a" --fg="#b8d4e3" --accent="#3ddc97" --tok-keyword="#ff7eb6"
  }
  fonts {
    font "Fira Code" src="fira.woff2" weight="400"
  }
  google-fonts "Inter:wght@400;700"
  animation move=0.5 fade=0.3 ease="ease-in-out" transition=slide stagger=0.12
  plugins "./qr.js"
}
````

| Node or property | Purpose |
| --- | --- |
| `title` `theme` | deck title; theme used at start (`dark`, `light`, `paper` or one of yours) |
| `author` `date` `order` `description` | shown on the deck's card in the gallery; `order` sorts the cards |
| `autoplay=5` `loop=#true` | the deck plays itself, a step every 5 s (a slide's own `autoplay` sets its pace); `loop` starts over at the end. Also `?autoplay=5&loop` in the URL, or the `a` key |
| `hidden=#true` `thumbnail="cover.png"` | keep the deck out of the gallery (it stays reachable with `?deck=name`); show an image instead of the live first slide |
| `css "file"` | extra stylesheet, relative to the deck folder |
| `vars` | CSS variables applied to the whole deck (as properties) |
| `defaults` | properties every slide gets unless it sets its own: `align` `valign` `background` `margin` `justify` `transition` |
| `code-style` | look of every code block (a block's own properties win): `bg` (`panel`, `none` or a color), `lines`, `radius`, `pad` |
| `header` `footer` | a bar on every slide with `left` `center` `right` slots holding text or an image (a logo); also `height` `background` `color` `border` `cover` (show on cover slides too). Text takes `{slide}` `{slides}` `{title}` `{slideTitle}` `{author}` `{date}` |
| `themes` | custom themes (one node per theme, its properties are CSS variables); they join the `t` key cycle |
| `fonts` `google-fonts` | local font files (relative to the deck folder); families from Google Fonts (needs network) |
| `animation` | seconds (`move` `fade`), `ease`, text entrance `transition` and `stagger` |
| `plugins` | plugin modules (files or npm packages) |

`deck.json` takes the same keys as JSON (`"vars"`, `"themes"`, `"footer": { "left": ["logo.svg", "ACME"] }`, `"animation"` with
`moveDelay`, `fadeInDelay`, `slideFade`, `textDrift`…). Two complete custom themes (`sunset`, `terminal`) live in
`examples/theming/deck.json`. Themes are plain CSS variables (`--bg`, `--fg`, `--heading`, `--muted`, `--accent`, `--code-bg`,
`--tok-*` for token colors, `--font-text`, `--font-heading`, `--font-code`…); see `src/style.css` for the full list.

## Old decks (the tag markup)

Decks written in the old tag markup (`.slide` files with `<h1>`, `<row>`, `<code><frame>`…) are converted by
`slides migrate my-deck` (`--split` keeps one file per old file, `--remove` deletes the old files). Each `<section>` becomes a child of a `swap` and the `<frame>`s of a `<code>` become the `code`s of one; what has no counterpart any more (`at=`, `delay=`, `margin:` and friends in the slide block) is
reported, and the sizes and margins become CSS variables on the slide.

## Writing decks with an LLM

The site also serves `llms.txt` (a compact language reference and instructions for models) and `llms-full.txt` (this README plus every slide of the manual decks). Give a model the URL, describe your talk, and ask for a deck folder: one `.slides` file. For example:

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

`slides check <deck...>` validates every `.slides` file against the schema (unknown nodes and properties, nodes in the wrong place, bad values, missing texts; with a "did you mean") and prints `file:line:col: message`; it exits with 1 when something is wrong, so it fits CI. `slides lsp` serves the same checks to editors. `slides schema` prints the schema (`src/schema.ts`: every node, its arguments, flags and properties, and what may sit inside it; the layouts) as JSON, the same data the editor tooling uses. `slides migrate <deck>` converts an old tag-markup deck.

## Starting from a PowerPoint template

`slides import template.pptx my-deck` (also `.potx`) builds a deck folder from a PowerPoint template: the **backgrounds** (a slide's background image, or a picture that covers the whole slide) go to `assets/` (`cover` is the first slide's, `content` the next different one, which becomes `defaults.background`, the background of every slide); **logos** on the master or layouts go to the header or footer bar by the corner they sit in; the **theme colors and fonts** become `vars` (a template that still has Office's default theme gets its colors from the pictures instead); and the **free area** of the slide becomes `defaults.margin`. With Chrome or Chromium on the machine the importer looks at the background images (the main color, the strongest and darkest colors, what runs along a side or sits in a corner) to find where text may go; without it the margins are the defaults and a note says so. You get one example slide (`<name>.slides`) and a README saying how to use the other backgrounds: a slide with only `slide background="assets/cover.jpg"` in it shows just that picture. Then edit `deck.json` and the slides and run `slides dev my-deck`. Fonts are named, not shipped (they are not inside a `.pptx`): install them or list font files under `fonts` in `deck.json`.

## Editors

`slides lsp` is a language server (stdio): diagnostics from the schema check, completion (with snippets) and hover for nodes, properties, flags and values, outline, folding and go to definition for code ids. `editors/vscode` is a VS Code / VSCodium / Cursor extension: KDL highlighting, the language server bundled (nothing to install for completion), snippets, and **Slides: Open preview to the side**, which runs `slides dev` in the background and shows it beside the editor, following the cursor to the slide you are editing. `editors/vim` has the filetype, syntax, the Neovim LSP setup and how to use the KDL tree-sitter grammar. See the README in each folder.
## GitHub Action and template

`geraldserafin/md-slides@action-v1` checks a deck, builds the site (and a PDF) and uploads it for GitHub Pages:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: geraldserafin/md-slides@action-v1
        with:
          deck: talk        # a folder of .slides files, or a folder of decks
          pdf: 'true'       # also writes <deck>.pdf into the site
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: github-pages
    steps:
      - uses: actions/deploy-pages@v4
```

| Input | Default | |
| --- | --- | --- |
| `deck` | `.` | a folder of `.slides` files, or a folder of such folders |
| `output` | `_site` | where the site is written (also the action's `path` output) |
| `pdf` | `false` | export a PDF per deck into the site (Chrome is on the GitHub runners) |
| `check` | `true` | fail on mistakes in the `.slides` files |
| `pages` | `true` | upload the site as the Pages artifact; `false` to deploy it some other way |
| `hub` | | a `hub.json` for the chooser page of several decks |
| `version` | `latest` | the version of `@geraldserafin/slideit` |

**One click:** [geraldserafin/slideit-template](https://github.com/geraldserafin/slideit-template) is a GitHub template with a starter
deck and this workflow. *Use this template*, then *Settings → Pages → Source: GitHub Actions*; a live example is at
<https://geraldserafin.github.io/slideit-template/>.

## Plugins

A deck can load plugins (`plugins "./demo.js" "@someone/slideit-plugin-qr"` in the `deck` node): ES modules that add **nodes**, **themes**,
**tree-sitter languages**, **toolbox buttons** and **step hooks**. The viewer loads them before it reads the slides, and `slides check`
and the editor tooling know their nodes. `examples/plugin-demo` is a working example and [docs/plugins.md](docs/plugins.md) is the guide
for authors (the format, packaging for npm, describing the nodes to editors).

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
npm run build:viewer  # the prebuilt viewers in viewer/ that the published package ships
```

A published package ships the viewer prebuilt (`viewer/`, four variants: with or without the diagram library, normal or "single"), so `slides build` takes a fraction of a second and `slides dev` starts at once: they copy the viewer and add the decks. From a clone there is no `viewer/` and the CLI builds the viewer with vite on the fly (`slides dev --vite` forces vite, with hot reload of the viewer's own code).

A Nix/devenv shell with Node and Chromium is provided (`devenv shell`).

Layout:

```
cli/        the `slides` command (new, dev, build, check, schema), the prebuilt-viewer dev server
src/        the markup (markup.ts, schema.ts, check.ts), the viewer (browser): parsing, GumTree, layout, renderer, themes, drawer, chrome (header/footer), presenter
tests/      vitest suites; tests/fixtures/ has matcher regression cases (old.*, new.*, expect.txt)
examples/   demo decks used for development and GitHub Pages
```

Matcher regressions are easiest to add as fixtures: put `old.<ext>`, `new.<ext>` and an `expect.txt` in a new
folder under `tests/fixtures/` (the directive format is described at the top of
`tests/match-regression.test.ts`).

## License

BSD-3-Clause, see [LICENSE](LICENSE).
