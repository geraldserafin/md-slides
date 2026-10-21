# slideit for Vim and Neovim

Install this folder as a plugin (`vim-plug`: `Plug 'geraldserafin/md-slides', { 'rtp': 'editors/vim' }`, or copy `ftdetect/` and
`syntax/` into your runtime path). It sets the `slides` filetype for `*.slides` and highlights the language (KDL: nodes, properties,
strings, raw strings, comments).

## Tree-sitter

The language is KDL, so the KDL grammar works: in Neovim with nvim-treesitter install `kdl` (`:TSInstall kdl`) and register it for the
filetype:

```lua
vim.treesitter.language.register('kdl', 'slides')
```

## Language server (Neovim 0.11+)

`slides lsp` gives diagnostics, completion and hover:

```lua
vim.lsp.config('slides', {
  cmd = { 'slides', 'lsp' },
  filetypes = { 'slides' },
  root_markers = { 'deck.json', '.git' },
})
vim.lsp.enable('slides')
```

Older Neovim with nvim-lspconfig: `vim.lsp.start({ name = 'slides', cmd = { 'slides', 'lsp' } })` from a `FileType slides` autocmd.
