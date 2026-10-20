# Writing a slideit plugin

A plugin is an ES module that a deck lists in `deck.json`:

```json
{ "plugins": ["./demo.js", "@someone/slideit-plugin-qr"] }
```

The viewer imports it **before** it parses the slides, so a plugin can add tags the markup then understands. A plugin runs in the
page with the same power as the deck's own scripts: add only plugins you trust, as you would an npm dependency.

```js
export default {
  name: 'demo',
  tags:      { /* new tags */ },
  themes:    { /* name -> CSS variables */ },
  languages: [ /* tree-sitter grammars */ ],
  tools:     [ /* toolbox buttons */ ],
  hooks:     { /* step(api, info) */ },
};
```

Everything is optional. `examples/plugin-demo` is a working deck with a plugin (`<timer>`, `<badge>`, a theme, a button, a hook).

## Tags

```js
tags: {
  badge: {
    doc: 'A small colored label.',                    // shown by the editor tooling
    attrs: { color: { doc: 'a CSS color', values: ['orange', 'green'] } },
    // raw: true,    the content is not parsed (like <code>): `<` and `&` need no escaping, `text` is all of it
    // empty: true,  no content, written <badge />
    render({ tag, attrs, text, el, base }) {
      return `<b>${text}</b>`;                         // a string of HTML, a Node, or nothing (if you filled `el` yourself)
    },
  },
}
```

- A tag takes the animation attributes of every tag (`anim`, `delay`, `dur`, `at`, `out`, `id`) and sits wherever a `<p>` may (the
  slide, a section, a row, a col, a step). It cannot sit inside text tags, and it cannot replace a built-in tag.
- `attrs` are the attributes of the tag as written (`color=green` → `attrs.color === 'green'`; a bare word is `'true'`).
- `text` is the text directly inside the tag; for a `raw` tag, everything inside, with the common indentation removed.
- `render` may be `async`; the slide is laid out again when the promise resolves. A thrown error shows up on the slide as a red note
  with the tag name, not as a blank page.
- `el` is the element of the item. To keep timers or listeners from outliving the slide, stop them when `el.isConnected` turns false.
- `base` is the URL of the deck folder (ends in `/`), for files the tag refers to.

## Themes, tools, hooks

```js
themes: { sepia: { '--bg': '#f4ecd8', '--fg': '#433422' } },        // join the `t` key cycle, like deck.json "themes"
tools:  [{ title: 'Next', icon: '<svg viewBox="0 0 24 24" …/>', run: (api) => api.player.next() }],   // toolbox buttons
hooks:  { step: (api, { step, slide }) => { /* the viewer moved */ } },
```

`api` is `{ player, deck }`: `player.next()`, `player.prev()`, `player.go(step)`, `player.state()`; `deck` is the loaded deck (slides,
meta). The icon is an inline SVG drawn with `currentColor`.

## Languages

```js
languages: [{ name: 'zig', tags: ['zig'], wasm: './tree-sitter-zig.wasm' }]   // wasm is relative to the plugin file
```

`<code lang=zig>` is then parsed with that grammar, so the code morphs like any other language.

## Packaging

- **A file in the deck folder** (`"./demo.js"`) travels with the deck.
- **An npm package** (`"@someone/slideit-plugin-qr"`): install it next to the deck (`npm i @someone/slideit-plugin-qr`). The CLI copies the
  package into the deck's output (`_plugins/…`) and loads its entry: `slideit.entry`, else `module`, else `main` from its
  `package.json`. Give your package the keyword `slideit-plugin` so people can find it.
- Keep a plugin **one self-contained file**: a plugin that imports other files breaks in the `single` target (the whole deck is one
  HTML file, and a module loaded from a `data:` URL cannot import its neighbours).

### Telling the editor about your tags

`slides check` and the language server (completion, hover, diagnostics) need to know a plugin's tags without running a browser. For an npm
package describe them as data in `package.json`:

```json
{
  "keywords": ["slideit-plugin"],
  "slideit": {
    "entry": "dist/plugin.js",
    "tags": {
      "qr": { "doc": "A QR code.", "empty": true, "attrs": { "value": { "doc": "what it encodes" } } }
    }
  }
}
```

Without that field the CLI imports the plugin module in node and reads its `tags`; that works if the module does not touch the
browser (`document`, `window`) when it loads.
