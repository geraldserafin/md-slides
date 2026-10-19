// tree-sitter (web-tree-sitter) adapter -> Tree. The only place that knows
// concrete grammars. New language: add its tags to tags.json and make sure
// tree-sitter-<name>.wasm exists in the tree-sitter-wasms package.
import Parser from 'web-tree-sitter';
import type { Tree } from './gumtree';
import tags from './tags.json';

export type Lang = string; // grammar name, e.g. "cpp", "typescript"

/** markdown fence tag -> grammar name */
const TAGS: Record<string, Lang> = tags;

export const langFromTag = (tag: string): Lang | undefined => TAGS[tag.toLowerCase()];

/** Where the .wasm files live: a URL (browser) or a path (node). */
export interface GrammarSources {
  runtime?: string; // tree-sitter.wasm
  grammar(lang: Lang): string;
}

let sources: GrammarSources | undefined;
let initPromise: Promise<void> | undefined;
const languages = new Map<Lang, Promise<Parser.Language>>();
const parsers = new Map<Lang, Parser>();

export function configureGrammars(s: GrammarSources) {
  sources = s;
}

async function ensureInit() {
  if (!sources) throw new Error('configureGrammars() not called');
  initPromise ??= Parser.init(
    sources.runtime ? { locateFile: () => sources!.runtime! } : undefined,
  );
  await initPromise;
}

async function parserFor(lang: Lang): Promise<Parser> {
  await ensureInit();
  let p = parsers.get(lang);
  if (p) return p;
  let l = languages.get(lang);
  if (!l) {
    l = Parser.Language.load(sources!.grammar(lang));
    languages.set(lang, l);
  }
  p = new Parser();
  p.setLanguage(await l);
  parsers.set(lang, p);
  return p;
}

function freeze(src: string, root: Parser.SyntaxNode): Tree {
  let counter = 0;
  const go = (node: Parser.SyntaxNode): Tree => {
    const id = counter++;
    const children = node.children.map(go);
    return {
      id,
      label: node.type,
      text: children.length === 0 ? src.slice(node.startIndex, node.endIndex) : '',
      start: node.startIndex,
      end: node.endIndex,
      children,
    };
  };
  return go(root);
}

export async function parseOne(lang: Lang, src: string): Promise<Tree> {
  const p = await parserFor(lang);
  const tree = p.parse(src);
  const t = freeze(src, tree.rootNode);
  tree.delete();
  return t;
}
