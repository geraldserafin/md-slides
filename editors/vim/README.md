# slideit for Vim and Neovim

Install this folder as a plugin (`vim-plug`: `Plug 'geraldserafin/md-slides', { 'rtp': 'editors/vim' }`, or copy `ftdetect/` and
`syntax/` into your runtime path). It sets the `slide` filetype for `*.slide` and highlights tags, attributes and the raw blocks.

## Language server (Neovim 0.11+)

`slides lsp` gives diagnostics, completion and hover:

```lua
vim.lsp.config('slides', {
  cmd = { 'slides', 'lsp' },
  filetypes = { 'slide' },
  root_markers = { 'deck.json', '.git' },
})
vim.lsp.enable('slides')
```

Older Neovim with nvim-lspconfig: `vim.lsp.start({ name = 'slides', cmd = { 'slides', 'lsp' } })` from a `FileType slide` autocmd.
