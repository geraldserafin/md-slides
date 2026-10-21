# Architecture

slides is a compiler with a player. A deck in the `.slides` language goes in; a show comes out. Everything in between is built of
plugins, the ones the tool ships with included: there is a small kernel, and the language, the layouts, the transitions, the code
animation and the exports are all registered with the same API your own plugins use.

```
.slides sources
   │  kernel/kdl      parse (KDL v2) → AST with positions
   ▼
AST ── plugins: `plugin` nodes (written in the language) are read first, then `deck` and `layout`, then the slides
   │  kernel/compile  every top-level node is lowered by the plugin that defines it
   ▼
Program (IR) ── a tree of elements per slide; each element knows the stages it is on for, its key, its effect and transition
   │  passes          plugins transform the whole program (the code plugin resolves `code from="…"`)
   ▼
Steps ── (slide, stage) pairs; services prepare what they need (the code plugin parses and matches every state of every block)
   │  runtime/player  draws the elements with the renderers of the plugins, moves between steps with their transitions
   ▼
the show ── in the browser; the same program feeds static sites, PDF, single files and the thumbnails
```

## The kernel

Small, and it knows no node by name:

| Module | Does |
| --- | --- |
| `kernel/kdl.ts` | the parser (KDL v2) wrapped in plain objects: name, arguments, properties, children, position |
| `kernel/registry.ts` | what the plugins said: nodes, layouts, layout rules, effects, transitions, languages, themes. A name taken twice is an error unless the later plugin lists it in `replaces` |
| `kernel/compile.ts` | `compile(files, registry)`: runs the top-level nodes in phases (plugins, deck and layouts, slides), then the passes |
| `kernel/lower.ts` | the context a node's `lower` runs in: the timeline cursor, elements, errors with positions, expansion of nodes written in the language |
| `kernel/kdlplugin.ts` | a plugin written in the language: `plugin "ui" { node … effect … theme … }` |
| `kernel/check.ts` | `slides check` and the editor tooling: validates a file against the registry |
| `kernel/schema.ts` | the registry as plain data (`slides schema`) |
| `runtime/` | the DOM side: loading a deck, the steps, the player |

The kernel runs in node and in the browser alike. The DOM never appears in it; a plugin's DOM side is a separate module
(`runtime.ts`) that only the viewer loads, so `slides check` and the language server need no browser.

## The program

`compile` returns a **Program**: plain data you can look at, test and serialize.

```ts
interface Program { name; meta: DeckMeta; slides: Slide[] }
interface Slide   { meta; own; root: Element; notes; title; url; stages; autoplay: Autoplay[] }
interface Element {
  kind: string; props: Record<string, unknown>; children?: Element[];
  at: number; out?: number;         // the stages it is on for: [at, out)
  key?: string;                     // identity: an id, a picture's file, a code block
  effect?: string;                  // how it comes in (`anim=`)
  transition?: string;              // the transition of the swap it is in
  region?: string; phase?: number;  // the swap it belongs to, and its turn in it
}
```

**Time is a number on each element.** A slide has stages; a click moves from one stage to the next; an element is there from stage
`at` until stage `out`. `pause`, `step`, `list steps` and `swap` are all just rules that assign those numbers: they are plugins
(`core-timeline`, `core-text`), and the runtime knows nothing of them. A `swap` that plays by itself is a *region* with a timer: the
runtime keeps which child is on, and each element knows its `phase`.

**Layout is a tree of containers.** `row`, `col` and `stack` (a swap) are elements with children; everything else is a leaf. A layout
(`two-cols`, `gallery`, yours) is a function from the parts of a slide to such a tree. Without `layout=` there is no guessing: a slide is
one column of what is written, and what is written decides the rest.

## Plugins

A plugin is an object:

```ts
interface Plugin {
  name: string;  api?: number;  replaces?: string[];
  nodes?:       Record<string, NodeDef>;      // the language
  layouts?:     Record<string, LayoutDef>;    // where parts go
  effects?:     Record<string, EffectDef>;    // `anim=`: the pose of a thing that is not there yet (CSS)
  transitions?: Record<string, TransitionDef>;// `transition=`: what happens to what comes and goes
  themes?:      Record<string, Record<string, string>>;
  languages?:   { name; tags; wasm }[];       // tree-sitter grammars for `code`
  passes?:      ((program, registry) => void)[];
  runtime?:     PluginRuntime | (() => PluginRuntime | Promise<PluginRuntime>);   // the DOM side
  tools?, hooks?                              // toolbox buttons, reaction to steps
}
```

A **node** has a shape (`args`, `flags`, `props`, `children`: this is what `check`, completion and hover are made from) and what it
becomes: `lower(node, ctx)` returns elements, `expand` is a template of other nodes (a node written in the language), and `render` draws an
element (for a plugin that is one file). The runtime half may be loaded later, as `runtime: () => import('./runtime.ts')`.

A **transition** is a function of what enters and what leaves:

```ts
run(ctx: { entering: View[]; leaving: View[]; scope: 'slide' | 'step'; ghost?: HTMLElement; instant: boolean;
           timing; show(view); hide(view); delegate(name, entering, leaving); px(rect) }): number | void
```

`entering` are views that come on at this step (in the DOM, hidden by their pose), `leaving` those that go off (still there, with the
rectangle they had). On a slide change the old slide is a `ghost`, pinned over the stage until the transition lets it go.
`show` and `hide` do the plain thing: the CSS transition of the pose. `delegate` hands part of the work to another transition.

**Pairing comes first.** Before a transition runs, the player offers what enters and what leaves to the `morph` transition: views with the same key
(an `id`, a picture's file) glide from their old place to the new one, and `morph` hands the rest to the transition that was asked for
(`ctx.props.rest`). A transition that wants no pairing says `pairs: false` (`none` does). So the transition says what happens to everything
else, and anyone can replace pairing by replacing `morph`.

A **service** is what a plugin keeps going while a show runs. The code plugin is one: it parses the code of all steps beforehand
(`prepare`), and while the show runs it draws tokens on a layer of the stage (`create` → `slide`, `step`, `layout`).

## The stock plugins

Loaded automatically, in this order; a deck's own plugins come after and may take a name over with `replaces`.

| Plugin | Provides |
| --- | --- |
| `kernel` | `plugin` (a plugin written in the language) and the nodes inside it |
| `core-deck` | `deck` and its children (vars, themes, fonts, header, footer, plugins, defaults, animation, code-style, css) |
| `core-layout` | `slide`, `layout`, `row`, `col`, `grid`, `slot`; the built-in layouts and the rule that chooses among them |
| `core-text` | `title`, `heading`, `text`, `quote`, `list`, `table`, `math`, `notes`; the inline markup |
| `core-media` | `image`, `video`, `audio`, `chart`, `diagram` |
| `core-timeline` | `pause`, `step`, `swap` |
| `core-transitions` | the effects (`fade`, `rise`, `zoom`, `left`, `right`, `down`, `blur`, `pop`, `none`) and the transitions `fade`, `slide`, `slide-right`, `slide-left`, `zoom`, `none` |
| `morph` | the transition `morph`: elements with the same key glide from their old place to the new one |
| `code` | `code`, the languages, the GumTree matching of the states of a block and the drawing of its tokens |

`morph` knows nothing about what it moves: it pairs views by key (and the player runs it first for every transition but `none`). The code plugin gives its tokens keys from the diff, so code morphs
by the same idea as a picture does; GumTree lives in `code`, not in `morph`.

## Extending

Three levels, from the least to the most code:

1. **In the language** (`plugin "ui" { … }` in a `.slides` file): new nodes made of existing ones (`node` with a `body`, `{text}` and
   `{prop}` substituted, `slot` for the children of the use), effects (`effect "flip" pose="…"`) and themes. No JS, nothing to install.
2. **One JS file** listed in `deck` under `plugins`: nodes with a `render`, effects, transitions, themes, tools, hooks.
3. **A package**: the same module on npm (`slideit-plugin-…`), described as data in its `package.json` (`"slideit": { "nodes": … }`) so the tools know
   its nodes without running it. A plugin may also split its DOM side (`runtime`) from the rest.

See [plugins.md](plugins.md) for the details and `examples/plugin-demo` for a deck that uses all three.

## Tools

`slides check`, the language server and the VS Code extension read the registry: a plugin's nodes complete, hover and are checked like
the built-in ones. `slides schema [deck]` prints it as JSON. `lib/` is the kernel, the plugins (without their DOM side) and the node
tools as plain JS, so the published package and the extension run them without a compile step.
