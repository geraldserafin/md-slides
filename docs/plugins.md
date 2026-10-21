# Writing a slides plugin

Everything slides does is a plugin: the nodes (`title`, `swap`, `code`…), the layouts, the transitions (`fade`, `morph`…), the code
animation. Yours use the same API. [architecture.md](architecture.md) says how the parts fit; this is how to write one.

There are three ways, from the least to the most code.

## 1. In the language

No JS: a `plugin` node at the top of a `.slides` file (any file of the deck).

```kdl
plugin "ui" {
  // a node made of nodes that exist already
  node "callout" doc="A box with a kind" {
    arg "text" doc="what it says"
    prop "kind" values="info warn" default="info" doc="its color"
    body {
      col class="callout-{kind}" {
        text "{text}"
        slot                       // the children of the use go here
      }
    }
  }
  // the pose of a thing that is not there yet: `anim=flip`
  effect "flip" pose="transform: perspective(700px) rotateY(80deg)" doc="comes in turned away"
  theme "sunset" --bg="#2a1b2e" --fg="#f0d4c0"
}

slide {
  callout "Careful" kind=warn { text "inside" }
  text "turns in" anim=flip
}
```

- `arg`s are the positional arguments, `prop`s the properties (`values` separated by spaces, `default` used when it is not written), `flag`s
  the bare words. `{text}` is the first argument, `{kind}` a property.
- The classes in the body are yours to style (`css "deck.css"` in the `deck` node).
- The node is checked and completed in the editor like the built-in ones.

## 2. One JS file

List it in the `deck` node (or in `deck.json`):

```kdl
deck { plugins "./demo.js" "@someone/slideit-plugin-qr" }
```

The viewer imports it before it reads the slides, so its nodes are part of the language. A plugin runs in the page with the same
power as the deck's own scripts: add only plugins you trust, as you would an npm dependency.

```js
export default {
  name: 'demo',
  api: 1,
  nodes: {
    badge: {
      doc: 'A small colored label.',                    // shown by the editor tooling
      part: true,                                       // may sit wherever a `text` may
      args: [{ name: 'text', doc: 'what it says' }],
      props: { color: { doc: 'a CSS color', values: ['orange', 'green'] } },
      render({ element, el, base }) {                   // draws it
        return `<b style="background:${element.props.color ?? 'orange'}">${element.props.text}</b>`;
      },
    },
  },
  effects:     { flip: { doc: 'Turned away.', pose: 'transform: rotateY(80deg)' } },
  transitions: { wipe: { doc: 'Uncovered from the left.', run(ctx) { /* see below */ } } },
  themes:      { sepia: { '--bg': '#f4ecd8', '--fg': '#433422' } },
  tools:       [{ title: 'Next', icon: '<svg viewBox="0 0 24 24" …/>', run: (api) => api.player.next() }],
  hooks:       { step: (api, { step, slide }) => { /* the viewer moved */ } },
};
```

Everything but `name` is optional. `examples/plugin-demo` is a working deck.

### Nodes

A node with a `render` and no `lower` becomes an element of its own kind: `element.props` are its properties, `element.props.text` its
first argument. It takes the properties every shown node takes: `anim` (an effect) and `id` (a key for morph). A node that needs more
decides what it becomes with `lower(node, ctx)`: it returns elements, and `ctx` has the cursor of the timeline (`ctx.stage`,
`ctx.advance()`), the means to lower its children (`ctx.lower(node.children)`), errors with positions (`ctx.fail(node, message)`) and
`ctx.element(kind, node, props, children)` to make an element that is on the stage the cursor is at.

`render({ element, el, base, children, relayout })` returns a string of HTML, a DOM node, or nothing (if you filled `el` yourself). It may
be `async` (the slide is laid out again when it resolves) and a thrown error shows up on the slide as a red note with the node name,
not as a blank page. `el` is the element of the item: stop timers and listeners when `el.isConnected` turns false. `base` is the
URL of the deck folder, for files the node refers to.

### Effects and transitions

An **effect** (`anim=flip`) is the pose of a thing that is not there yet: CSS declarations (`pose`) that it leaves when it comes in and
returns to when it goes out. More CSS goes in `css`, where `&` is the element.

A **transition** (`transition=wipe` on a slide or a swap) is a function of what comes and what goes:

```js
run(ctx) {
  // ctx.entering, ctx.leaving: views { element, el, rect }, in the DOM; `rect` is where a leaving view was
  // ctx.scope: 'step' (inside a slide) or 'slide' (the slide changes: the old one is ctx.ghost until you let it go)
  // ctx.show(view) / ctx.hide(view): the plain thing, the CSS transition of the pose
  // ctx.delegate('fade', entering, leaving): hand some views to another transition
  // ctx.timing: { move, fade, stagger, drift, delay, leave }   ctx.px(rect): stage pixels   ctx.instant: no animation
  for (const v of ctx.leaving) ctx.hide(v);
  for (const v of ctx.entering) { ctx.show(v); v.el.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0)' }], 600); }
  return 700;   // how long (ms) the ghost of the old slide may stay; optional
}
```

`morph` is such a transition: it pairs entering and leaving views by `element.key` and animates the old rectangle to the new one. The player runs it
first for every transition that does not say `pairs: false` (a hard cut does), and `morph` hands what it did not pair to the transition that was
asked for (`ctx.props.rest`). You can replace it (`replaces: ['morph']`) to pair differently.

### Themes, tools, hooks

```js
themes: { sepia: { '--bg': '#f4ecd8' } },        // join the `t` key cycle, like `themes` in the deck
tools:  [{ title: 'Next', icon: '<svg viewBox="0 0 24 24" …/>', run: (api) => api.player.next() }],   // toolbox buttons
hooks:  { step: (api, { step, slide }) => { /* the viewer moved */ } },
```

`api` is `{ player, deck }`: `player.next()`, `player.prev()`, `player.go(step)`, `player.state()`; `deck` is the program (slides, meta).
The icon is an inline SVG drawn with `currentColor`.

### Languages

```js
languages: [{ name: 'zig', tags: ['zig'], wasm: './tree-sitter-zig.wasm' }]   // wasm is relative to the plugin file
```

`code "zig" "…"` is then parsed with that grammar, so the code morphs like any other language.

### Names

A name another plugin took (a node, a layout, an effect, a transition) is an error, so a plugin cannot change the language by accident. To take
one over on purpose list it: `replaces: ['morph']`. `api: 1` is the version of the plugin API the plugin was written for; a newer one is refused with a
message.

## 3. A package

Publish the same module on npm (`slideit-plugin-…`) and list it by name. The CLI copies the package into the deck's output (`_plugins/…`)
and loads its entry: `slideit.entry`, else `module`, else `main` from its `package.json`.

- Keep a plugin **one self-contained file**: a plugin that imports other files breaks in the `single` target (the whole deck is one
  HTML file, and a module loaded from a `data:` URL cannot import its neighbours).
- To let the tools know your nodes without running a browser, describe them as data in `package.json`:

```json
{
  "keywords": ["slideit-plugin"],
  "slideit": {
    "entry": "dist/plugin.js",
    "nodes": {
      "qr": { "doc": "A QR code.", "part": true, "props": { "value": { "doc": "what it encodes" } } }
    }
  }
}
```

Without that field the CLI imports the plugin module in node and reads its `nodes`; that works if the module does not touch the browser
(`document`, `window`) when it loads. Put the DOM side behind `runtime: () => import('./runtime.js')` and it need not.

## Plugins of the first format

`{ name, tags: { badge: { doc, attrs, render({ tag, attrs, text, el, base }) } }, themes, languages, tools, hooks }` still loads: the tags become nodes.
