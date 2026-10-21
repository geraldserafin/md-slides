// Generates syntaxes/slides.tmLanguage.json: KDL with our nodes, and the code inside `code "lang" #"""…"""#` highlighted by
// the editor's own grammar for that language (the languages come from src/tags.json). Run: node editors/vscode/build-grammar.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tags = JSON.parse(readFileSync(join(here, '../../src/tags.json'), 'utf8'));
const SCOPES = {
  typescript: 'source.ts', tsx: 'source.tsx', javascript: 'source.js', cpp: 'source.cpp', c: 'source.c', python: 'source.python',
  rust: 'source.rust', go: 'source.go', java: 'source.java', bash: 'source.shell', json: 'source.json', html: 'text.html.basic',
  css: 'source.css', lua: 'source.lua',
};

const strings = [
  // raw multi-line #"""…"""#, raw #"…"#, multi-line """…""", "…"
  { begin: '(#+)"""', end: '"""\\1', name: 'string.quoted.triple.raw.slides' },
  { begin: '(#+)"', end: '"\\1', name: 'string.quoted.double.raw.slides' },
  { begin: '"""', end: '"""', name: 'string.quoted.triple.slides', patterns: [{ include: '#escape' }, { include: '#inline' }] },
  { begin: '"', end: '"', name: 'string.quoted.double.slides', patterns: [{ include: '#escape' }, { include: '#inline' }] },
];

const common = [
  { include: '#comment' },
  ...strings.map((_, i) => ({ include: `#string${i}` })),
  { match: '#(?:true|false|null|inf|-inf|nan)\\b', name: 'constant.language.slides' },
  { match: '(?<![\\w-])-?\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?(?![\\w-])', name: 'constant.numeric.slides' },
  { match: '([\\w.-]+)(=)', captures: { 1: { name: 'entity.other.attribute-name.slides' }, 2: { name: 'punctuation.separator.key-value.slides' } } },
  { match: '/-', name: 'keyword.operator.slashdash.slides' },
  // a node name: the first word of a statement
  { match: '(?:^|(?<=[{};]))\\s*(?:(/-)\\s*)?(-|[A-Za-z_][\\w.-]*)', captures: { 1: { name: 'keyword.operator.slashdash.slides' }, 2: { name: 'entity.name.tag.slides' } } },
  { match: '[\\w.-]+', name: 'variable.parameter.flag.slides' },
];

// code "lang" props #"""…"""#: the raw string in the language's grammar
const codeRules = Object.entries(SCOPES).map(([grammar, scope]) => {
  const names = [...new Set(Object.entries(tags).filter(([, g]) => g === grammar).map(([t]) => t.replace(/[+]/g, '\\+')))].join('|');
  return {
    begin: `^(\\s*)(code)(\\s+)("(?:${names})")([^#\\n]*?)(#+)"""\\s*$`,
    end: '^\\s*"""\\6',
    beginCaptures: {
      2: { name: 'entity.name.tag.slides' }, 4: { name: 'string.quoted.double.slides' },
      5: { patterns: [{ include: '#props' }] }, 6: { name: 'string.quoted.triple.raw.slides' },
    },
    endCaptures: { 0: { name: 'string.quoted.triple.raw.slides' } },
    contentName: scope,
    patterns: [{ include: scope }],
  };
});

const grammar = {
  $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
  name: 'Slides',
  scopeName: 'source.slides',
  patterns: [{ include: '#root' }],
  repository: {
    root: { patterns: [...codeRules, ...common] },
    props: { patterns: common },
    comment: {
      patterns: [
        { match: '//.*$', name: 'comment.line.double-slash.slides' },
        { begin: '/\\*', end: '\\*/', name: 'comment.block.slides' },
      ],
    },
    escape: { match: '\\\\(?:[nrt\\\\"/bf]|u\\{[0-9a-fA-F]{1,6}\\}|\\s)', name: 'constant.character.escape.slides' },
    // the inline markup inside the text of a node
    inline: {
      patterns: [
        { match: '\\*\\*[^*\\n]+\\*\\*', name: 'markup.bold.slides' },
        { match: '(?<![*\\w])\\*[^*\\s][^*\\n]*\\*(?![*\\w])', name: 'markup.italic.slides' },
        { match: '`[^`\\n]+`', name: 'markup.inline.raw.slides' },
        { match: '~~[^~\\n]+~~', name: 'markup.strikethrough.slides' },
        { match: '==[^=\\n]+==', name: 'markup.changed.slides' },
        { match: '\\[[^\\]\\n]+\\]\\([^)\\n]+\\)', name: 'markup.underline.link.slides' },
      ],
    },
  },
};
strings.forEach((s, i) => { grammar.repository[`string${i}`] = s; });

writeFileSync(join(here, 'syntaxes/slides.tmLanguage.json'), JSON.stringify(grammar, null, 2) + '\n');
console.log('syntaxes/slides.tmLanguage.json');
