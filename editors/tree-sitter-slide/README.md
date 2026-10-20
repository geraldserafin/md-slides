# tree-sitter-slide

A [tree-sitter](https://tree-sitter.github.io) grammar for the [slideit](https://github.com/geraldserafin/md-slides) markup (`.slide`
files). The raw tags (`code`, `c`, `tex`, `chart`, `diagram`, `notes`, `slide`, `frame`) keep their content as `raw_text` (an external
scanner, `src/scanner.c`); a `<code>` made of `<frame>`s is parsed as an ordinary element.

`queries/highlights.scm` highlights tags, attributes and entities. `queries/injections.scm` highlights the code inside
`<code lang=ts>` (and inside its `<frame>`s) as that language, and `<tex>` as LaTeX: the languages are the ones of `src/tags.json`.

All the decks of `examples/` parse without a single error (`tree-sitter test` has the corpus).

## Neovim (nvim-treesitter)

```lua
require('nvim-treesitter.parsers').slide = {
  install_info = {
    url = 'https://github.com/geraldserafin/md-slides',
    location = 'editors/tree-sitter-slide',
    queries = 'queries',
  },
  tier = 3,
}
vim.filetype.add({ extension = { slide = 'slide' } })
```

then `:TSInstall slide`. (Use it together with the filetype and LSP setup of `../vim`.) Not tested in Neovim itself: the grammar and
the queries are tested with the `tree-sitter` CLI.
