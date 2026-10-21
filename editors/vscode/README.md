# slideit for VS Code (and VSCodium, Cursor, …)

Support for `.slides` presentations ([slideit](https://github.com/geraldserafin/md-slides)):

- **Highlighting** of the language (KDL with our nodes), with the code inside `code "ts" { frame #"""…"""# }` highlighted as that language.
- **Completion** for nodes (only the ones allowed where you are, as snippets), properties, flags and values (layout names, `anim`…),
  the slots of the layout of the slide; **hover** documentation; **diagnostics** as you type (the same checks as `slides check`, with
  "did you mean"); **outline** and **folding** of slides, rows, columns and code blocks; **go to definition** from a code `id` / `from` to
  the blocks that share it. Plugin nodes are known too (from `plugins` of the deck).
- **Snippets**: `slide`, `cover`, `two` (two columns), `cols` (text and code), `code`, `list`, `row`, `col`, `step`, `chart`, `image`, `layout`… (type the name and Tab).
- **Live preview**: *Slides: Open preview to the side* (the preview icon in the editor title, `Ctrl+K V`) runs the dev server for the folder
  and shows it beside the editor. It reloads when you save and **follows the cursor**: it shows the slide you are in.

The language server is bundled, so none of it needs anything installed. The preview uses the `slides` command when it is on the PATH
(`npm i -g @geraldserafin/slideit`) and `npx` otherwise.

Settings: `slides.server` (bundled / cli), `slides.command`, `slides.args`, `slides.previewFollowsCursor`.

Development: `npm install` here, then F5 with this folder open. `npm run grammar` regenerates the grammar, `npm run server` bundles the
language server (both run on `vsce package`).
