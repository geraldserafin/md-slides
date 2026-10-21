// tree-sitter (web-tree-sitter) adapter -> Tree. The only place that knows
// concrete grammars. New language: add its tags to languages.ts and make sure
// tree-sitter-<name>.wasm exists in the tree-sitter-wasms package, or add it with a plugin (`languages`).
import Parser from 'web-tree-sitter';
import type { Tree } from './gumtree.ts';
import { LANGUAGE_TAGS } from './languages.ts';

export type Lang = string; // grammar name, e.g. "cpp", "typescript"

/** language tag (`lang=` of a code tag) -> grammar name */
const TAGS: Record<string, Lang> = { ...LANGUAGE_TAGS };

const extraWasm = new Map<Lang, string>();

export const langFromTag = (tag: string): Lang | undefined => TAGS[tag.toLowerCase()];

/** a plugin's language: `tags` are the `lang=` values, `wasm` the tree-sitter grammar */
export function registerLanguage(name: Lang, langTags: string[], wasm: string) {
  for (const t of langTags) TAGS[t.toLowerCase()] = name;
  extraWasm.set(name, wasm);
}

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
    l = Parser.Language.load(extraWasm.get(lang) ?? sources!.grammar(lang));
    languages.set(lang, l);
  }
  p = new Parser();
  p.setLanguage(await l);
  parsers.set(lang, p);
  return p;
}

/**
 * tree-sitter nodes -> Tree, with two normalizations so every visible character is a leaf:
 *  - whitespace-only leaves (e.g. Go's automatic-semicolon "\n") are dropped;
 *  - non-whitespace source text that no child covers (e.g. the contents of a Rust or Go string,
 *    which those grammars leave un-noded) becomes synthetic leaves, one per line.
 */
function freeze(src: string, root: Parser.SyntaxNode): Tree {
  let counter = 0;
  const leaf = (label: string, start: number, end: number): Tree =>
    ({ id: counter++, label, text: src.slice(start, end), start, end, children: [] });

  /** synthetic leaves for the uncovered, non-blank text of src[from, to) */
  const gapLeaves = (parent: Parser.SyntaxNode, from: number, to: number): Tree[] => {
    const out: Tree[] = [];
    const label = parent.type.includes('string') ? 'string_content' : 'text';
    let off = from;
    for (const line of src.slice(from, to).split('\n')) {
      const lead = line.length - line.trimStart().length;
      const text = line.trim();
      if (text) out.push(leaf(label, off + lead, off + lead + text.length));
      off += line.length + 1;
    }
    return out;
  };

  const go = (node: Parser.SyntaxNode, isRoot = false): Tree | undefined => {
    if (node.childCount === 0) {
      if (!isRoot && !src.slice(node.startIndex, node.endIndex).trim()) return undefined;
      return leaf(node.type, node.startIndex, node.endIndex);
    }
    const id = counter++;
    const children: Tree[] = [];
    let pos = node.startIndex;
    for (const c of node.children) {
      children.push(...gapLeaves(node, pos, c.startIndex));
      const t = go(c);
      if (t) children.push(t);
      pos = Math.max(pos, c.endIndex);
    }
    children.push(...gapLeaves(node, pos, node.endIndex));
    return { id, label: node.type, text: '', start: node.startIndex, end: node.endIndex, children };
  };
  return go(root, true)!;
}

export async function parseOne(lang: Lang, src: string): Promise<Tree> {
  const p = await parserFor(lang);
  const tree = p.parse(src);
  const t = freeze(src, tree.rootNode);
  tree.delete();
  return t;
}
