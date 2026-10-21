import { createRequire } from 'node:module';
import { configureGrammars } from '../src/plugins/code/parse.ts';

const require = createRequire(import.meta.url);

export function setupNodeGrammars() {
  configureGrammars({
    grammar: (lang) => require.resolve(`tree-sitter-wasms/out/tree-sitter-${lang}.wasm`),
  });
}
