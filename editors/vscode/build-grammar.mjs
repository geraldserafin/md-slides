// Generates syntaxes/slide.tmLanguage.json: the tag markup, with the code inside <code lang=…> highlighted by the editor's
// own grammar for that language (the languages come from src/tags.json). Run: node editors/vscode/build-grammar.mjs
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

const attrs = {
  patterns: [
    { match: '([\\w-]+)(=)([^\\s"\'>]+)', captures: { 1: { name: 'entity.other.attribute-name.slide' }, 2: { name: 'punctuation.separator.key-value.slide' }, 3: { name: 'string.unquoted.slide' } } },
    { match: '([\\w-]+)(=)(?=["\'])', captures: { 1: { name: 'entity.other.attribute-name.slide' }, 2: { name: 'punctuation.separator.key-value.slide' } } },
    { match: '[\\w-]+', name: 'entity.other.attribute-name.slide' },
    { begin: '"', end: '"', name: 'string.quoted.double.slide' },
    { begin: "'", end: "'", name: 'string.quoted.single.slide' },
  ],
};
const open = (name) => `(<)(${name})(?![\\w-])`;
const tagCaptures = { 1: { name: 'punctuation.definition.tag.begin.slide' }, 2: { name: 'entity.name.tag.slide' } };
const endCaptures = { 1: { name: 'punctuation.definition.tag.begin.slide' }, 2: { name: 'entity.name.tag.slide' }, 3: { name: 'punctuation.definition.tag.end.slide' } };

// <frame …> … </frame> with the language's grammar inside
const frame = (scope) => ({
  begin: '(<)(frame)(?![\\w-])([^>]*)(>)', end: '(</)(frame)(>)', contentName: scope,
  beginCaptures: { 1: tagCaptures[1], 2: tagCaptures[2], 3: { patterns: [attrs] }, 4: { name: 'punctuation.definition.tag.end.slide' } },
  endCaptures,
  patterns: [{ include: '#escape' }, { include: scope }],
});

const codeRules = Object.entries(SCOPES).map(([grammar, scope]) => {
  const names = [...new Set(Object.entries(tags).filter(([, g]) => g === grammar).map(([t]) => t.replace(/[+]/g, '\\+')))].join('|');
  return {
    begin: `(<)(code)(?![\\w-])(?=[^>]*\\blang=["']?(?:${names})["'\\s>/])([^>]*)(>)`, end: '(</)(code)(>)',
    beginCaptures: { 1: tagCaptures[1], 2: tagCaptures[2], 3: { patterns: [attrs] }, 4: { name: 'punctuation.definition.tag.end.slide' } },
    endCaptures,
    patterns: [frame(scope), { include: '#escape' }, { include: scope }],
  };
});

const raw = (name, scope, contentName) => ({
  begin: `(<)(${name})(?![\\w-])([^>]*)(>)`, end: '(</)(' + name + ')(>)', contentName,
  beginCaptures: { 1: tagCaptures[1], 2: tagCaptures[2], 3: { patterns: [attrs] }, 4: { name: 'punctuation.definition.tag.end.slide' } },
  endCaptures,
  patterns: [{ include: '#escape' }, ...(scope ? [{ include: scope }] : [])],
});

const grammar = {
  $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
  name: 'Slide',
  scopeName: 'text.slide',
  fileTypes: ['slide'],
  patterns: [{ include: '#slide-settings' }, ...codeRules, { include: '#raw' }, { include: '#tag' }, { include: '#entity' }],
  repository: {
    escape: { match: '\\\\</[a-z]+>', name: 'constant.character.escape.slide' },
    entity: { match: '&(#\\d+|#x[0-9a-fA-F]+|\\w+);', name: 'constant.character.entity.slide' },
    'slide-settings': {
      begin: '(<)(slide)(>)', end: '(</)(slide)(>)',
      beginCaptures: { 1: tagCaptures[1], 2: tagCaptures[2], 3: { name: 'punctuation.definition.tag.end.slide' } }, endCaptures,
      patterns: [
        { match: '^\\s*(#.*)$', captures: { 1: { name: 'comment.line.number-sign.slide' } } },
        { match: '^\\s*([\\w-]+)\\s*(:)\\s*(.*)$', captures: { 1: { name: 'variable.other.property.slide' }, 2: { name: 'punctuation.separator.key-value.slide' }, 3: { name: 'string.unquoted.slide' } } },
      ],
    },
    raw: {
      patterns: [
        raw('code', null, 'markup.raw.block.slide'),
        raw('c', null, 'markup.inline.raw.string.slide'),
        raw('tex', 'text.tex.latex', 'markup.math.slide'),
        raw('chart', null, 'markup.raw.block.csv.slide'),
        raw('diagram', null, 'markup.raw.block.slide'),
        raw('notes', null, 'comment.block.notes.slide'),
      ],
    },
    tag: {
      patterns: [
        { begin: '(</?)([a-z][\\w-]*)(?![\\w-])', end: '(/?>)', beginCaptures: tagCaptures, endCaptures: { 1: { name: 'punctuation.definition.tag.end.slide' } }, patterns: [attrs] },
      ],
    },
  },
};
writeFileSync(join(here, 'syntaxes/slide.tmLanguage.json'), JSON.stringify(grammar, null, 2) + '\n');
console.log('syntaxes/slide.tmLanguage.json');
