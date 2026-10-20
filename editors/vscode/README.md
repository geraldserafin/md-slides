# slideit for VS Code

Highlighting for `.slide` files (the code inside `<code lang=ts>` is highlighted as TypeScript, and so on), diagnostics from
`slides check`, completion and hover for tags and attributes, and a live preview beside the editor.

Needs the `slides` command: `npm i -g @geraldserafin/slideit`.

- **Slides: Open preview to the side** (the preview icon in the editor title, or `Ctrl+K V`) runs `slides dev` for the folder of the
  current file in the background and shows it in a Simple Browser. It reloads when you save.
- The language server is `slides lsp`; the settings `slides.command` and `slides.args` say how to start it.

Development: `npm install` here, then press F5 in VS Code with this folder open. `npm run grammar` regenerates the grammar
(from `../../src/tags.json`).
