# Writing a slides plugin

A plugin is an ES module that a deck lists in its `deck` node (or in `deck.json`):

```kdl
deck {
  plugins "./demo.js" "@someone/slideit-plugin-qr"
}
```

The viewer imports it **before** it reads the slides, so a plugin can add nodes the language then understands. A plugin runs in the
page with the same power as the deck's own scripts: add only plugins you trust, as you would an npm dependency.

```js
export default {
  name: 'demo',
  tags:      { /* new nodes */ },
  themes:    { /* name -> CSS variables */ },
  languages: [ /* tree-sitter grammars */ ],
  tools:     [ /* toolbox buttons */ ],
  hooks:     { /* step(api, info) */ },
};
```

Everything is optional. `examples/plugin-demo` is a working deck with a plugin (`timer`, `badge`, a theme, a button, a hook).

## Nodes

```js
tags: {
  badge: {
    doc: 'A small colored label.',                    // shown by the editor tooling
    attrs: { color: { doc: 'a CSS color', values: ['orange', 'green'] } },
    render({ tag, attrs, text, el, base }) {
      return `<b>${text}</b>`;                         // a string of HTML, a Node, or nothing (if you filled `el` yourself)
    },
  },
}
```

It is written `badge "new" color=green` in a deck.

- A node takes the animation properties of every node (`anim`, `id`) and sits wherever a `text` may (a slide, a `row`, a `col`, a
  `step`, a slot). It cannot replace a built-in node.
- `attrs` are the properties of the node as written (`color=green` → `attrs.color === 'green'`; numbers and booleans arrive as strings).
- `text` is the first argument of the node (`"new"`), or an empty string.
- `render` may be `async`; the slide is laid out again when the promise resolves. A thrown error shows up on the slide as a red note
  with the node name, not as a blank page.
- `el` is the element of the item. To keep timers or listeners from outliving the slide, stop them when `el.isConnected` turns false.
- `base` is the URL of the deck folder (ends in `/`), for files the node refers to.

## Themes, tools, hooks

```js
themes: { sepia: { '--bg': '#f4ecd8', '--fg': '#433422' } },        // join the `t` key cycle, like `themes` in the deck
tools:  [{ title: 'Next', icon: '<svg viewBox="0 0 24 24" …/>', run: (api) => api.player.next() }],   // toolbox buttons
hooks:  { step: (api, { step, slide }) => { /* the viewer moved */ } },
```

`api` is `{ player, deck }`: `player.next()`, `player.prev()`, `player.go(step)`, `player.state()`; `deck` is the loaded deck (slides,
meta). The icon is an inline SVG drawn with `currentColor`.

## Languages

```js
languages: [{ name: 'zig', tags: ['zig'], wasm: './tree-sitter-zig.wasm' }]   // wasm is relative to the plugin file
```

`code "zig"` is then parsed with that grammar, so the code morphs like any other language.

## Packaging

- **A file in the deck folder** (`"./demo.js"`) travels with the deck.
- **An npm package** (`"@someone/slideit-plugin-qr"`): install it next to the deck (`npm i @someone/slideit-plugin-qr`). The CLI copies the
  package into the deck's output (`_plugins/…`) and loads its entry: `slideit.entry`, else `module`, else `main` from its
  `package.json`. Give your package the keyword `slideit-plugin` so people can find it.
- Keep a plugin **one self-contained file**: a plugin that imports other files breaks in the `single` target (the whole deck is one
  HTML file, and a module loaded from a `data:` URL cannot import its neighbours).

### Telling the editor about your nodes

`slides check` and the language server (completion, hover, diagnostics) need to know a plugin's nodes without running a browser. For an npm
package describe them as data in `package.json`:

```json
{
  "keywords": ["slideit-plugin"],
  "slideit": {
    "entry": "dist/plugin.js",
    "tags": {
      "qr": { "doc": "A QR code.", "props": { "value": { "doc": "what it encodes" } } }
    }
  }
}
```

Without that field the CLI imports the plugin module in node and reads its `tags`; that works if the module does not touch the
browser (`document`, `window`) when it loads.
