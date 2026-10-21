// The languages `code "ts"` knows: a tag -> the tree-sitter grammar (tree-sitter-<name>.wasm of the tree-sitter-wasms package).
// A new one: add its tags here and make sure the grammar exists; or add a language with a plugin (`languages`).
export const LANGUAGE_TAGS: Record<string, string> = {
  ts: 'typescript', typescript: 'typescript', tsx: 'tsx',
  js: 'javascript', javascript: 'javascript', jsx: 'javascript',
  cpp: 'cpp', 'c++': 'cpp', cxx: 'cpp', cc: 'cpp', hpp: 'cpp',
  c: 'c', h: 'c',
  py: 'python', python: 'python',
  rs: 'rust', rust: 'rust',
  go: 'go', golang: 'go',
  java: 'java',
  sh: 'bash', bash: 'bash', shell: 'bash',
  json: 'json', html: 'html', css: 'css', lua: 'lua',
};

/** the same as a list of languages (for a plugin) */
export const LANGUAGES = Object.entries(
  Object.entries(LANGUAGE_TAGS).reduce<Record<string, string[]>>((m, [tag, name]) => ((m[name] ??= []).push(tag), m), {}),
).map(([name, tags]) => ({ name, tags }));
