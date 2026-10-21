-- slideit for Neovim 0.11+: the language server (`slides lsp`) for `.slides` files, and tree-sitter highlighting through the KDL grammar
-- when it is installed (otherwise `syntax/slides.vim` does the colors).
-- To run the server some other way: `vim.g.slideit_cmd = { 'node', '/path/to/slideit/cli/slideit.mjs', 'lsp' }` before this loads.
if vim.fn.has('nvim-0.11') == 0 or vim.g.slideit_loaded then return end
vim.g.slideit_loaded = true

pcall(vim.treesitter.language.register, 'kdl', 'slides')

local cmd = vim.g.slideit_cmd or { 'slides', 'lsp' }
if vim.fn.executable(cmd[1]) == 1 then
  vim.lsp.config('slideit', { cmd = cmd, filetypes = { 'slides' }, root_markers = { 'deck.json', '.git' } })
  vim.lsp.enable('slideit')
end
