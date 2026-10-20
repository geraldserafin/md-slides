# slideit for VS Code (and VSCodium, Cursor, …)

Support for `.slide` presentations ([slideit](https://github.com/geraldserafin/md-slides)):

- **Highlighting**, with the code inside `<code lang=ts>` highlighted as that language.
- **Completion** for tags (only the ones allowed where you are), attributes, attribute values and the keys and values of a `<slide>`
  block; **hover** documentation; **diagnostics** as you type (the same checks as `slides check`); **outline** and **folding** of
  sections, rows, columns and code blocks; **go to definition** from a code `id` / `from` to the blocks that share it. Plugin
  tags are known too (from `deck.json` "plugins").
- **Snippets**: `cover`, `cols` (text left, code right), `code`, `row`, `col`, `step`, `section`, `chart`, `img`, … (type the name and Tab).
- **Auto-closing tags**: typing `>` after `<row>` inserts `</row>`.
- **Live preview**: *Slides: Open preview to the side* (the preview icon in the editor title, `Ctrl+K V`) runs the dev server for the folder
  and shows it beside the editor. It reloads when you save and **follows the cursor**: it shows the slide, and the section, you are in.

The language server is bundled, so none of it needs anything installed. The preview uses the `slides` command when it is on the PATH
(`npm i -g @geraldserafin/slideit`) and `npx` otherwise.

Settings: `slides.server` (bundled / cli), `slides.command`, `slides.args`, `slides.autoCloseTags`, `slides.previewFollowsCursor`.

Development: `npm install` here, then F5 with this folder open. `npm run grammar` regenerates the grammar, `npm run server` bundles the
language server (both run on `vsce package`).
