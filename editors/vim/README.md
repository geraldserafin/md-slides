# slideit for Vim and Neovim

Install this folder as a plugin: `vim-plug`: `Plug 'geraldserafin/slideit', { 'rtp': 'editors/vim' }`; a package manager of Neovim the
same way; or link it into a pack folder (`~/.config/nvim/pack/slideit/start/slideit`).

- `ftdetect/` sets the filetype `slides` for `*.slides`; `ftplugin/` sets `//` comments and two-space indent.
- `syntax/` colors the language (KDL: nodes, properties, strings, raw strings, comments, and `**bold**` / `` `code` `` inside strings).
- `plugin/slideit.lua` (Neovim 0.11+) registers the KDL tree-sitter grammar for the filetype, when it is installed
  (`:TSInstall kdl`), and starts the language server `slides lsp`: diagnostics, completion, hover, outline, folding, go to definition.
  It needs `slides` on the `PATH`; to run it another way set `vim.g.slideit_cmd = { 'node', '/path/cli/slideit.mjs', 'lsp' }` before the
  plugin loads.

Older Neovim with nvim-lspconfig: `vim.lsp.start({ name = 'slideit', cmd = { 'slides', 'lsp' } })` from a `FileType slides` autocmd.
