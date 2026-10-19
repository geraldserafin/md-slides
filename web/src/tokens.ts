// Kategoria tokenu (z typu węzła tree-sitter) -> klasa CSS. Zbiór słów
// kluczowych jest wspólny dla wszystkich języków; kolory siedzą w motywach.
const KEYWORDS = new Set([
  'function', 'return', 'const', 'let', 'var', 'for', 'if', 'else', 'interface', 'export', 'import',
  'from', 'of', 'new', 'class', 'extends', 'implements', 'type', 'public', 'private', 'protected',
  'readonly', 'static', 'async', 'await', 'in', 'instanceof', 'typeof', 'struct', 'namespace',
  'template', 'typename', 'using', 'auto', 'constexpr', 'noexcept', 'virtual', 'override', 'friend',
  'operator', 'try', 'catch', 'throw', 'switch', 'case', 'break', 'continue', 'while', 'do', 'sizeof',
  'enum', 'union', 'mutable', 'explicit', 'inline', 'default', 'delete', 'this',
  'def', 'lambda', 'pass', 'with', 'as', 'elif', 'except', 'finally', 'yield', 'raise', 'not', 'and',
  'or', 'is', 'fn', 'impl', 'trait', 'mut', 'pub', 'use', 'mod', 'match', 'loop', 'func', 'package',
  'go', 'defer', 'chan', 'select', 'range', 'final', 'abstract', 'throws', 'extern', 'unsafe',
]);

export function tokenClass(label: string): string {
  if (KEYWORDS.has(label)) return 'keyword';
  if (['number', 'integer', 'float', 'number_literal', 'string', 'string_literal', 'string_fragment',
    'true', 'false', 'null', 'undefined', 'nullptr', 'none', 'None', 'True', 'False'].includes(label)) return 'builtin';
  if (['type_identifier', 'primitive_type', 'sized_type_specifier', 'predefined_type'].includes(label)) return 'type';
  if (['property_identifier', 'field_identifier'].includes(label)) return 'property';
  if (label === 'identifier') return 'ident';
  if (label.includes('comment')) return 'comment';
  if (!/[a-z]/i.test(label)) return 'punct';
  return 'plain';
}
