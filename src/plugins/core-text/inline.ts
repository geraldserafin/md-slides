// The inline markup inside the text of a node, as HTML:
//   **bold** *italic* ~~strike~~ ==mark== ~sub~ ^sup^ `code` [text](url) $tex$ [[Key]]   a newline is a line break.
// `\*` writes a special character as itself. Nothing else is special, so `snake_case`, `a * b` and `<` stay as they are.

export interface InlineOpts {
  /** KaTeX (or anything else) for `$…$` */
  tex?: (src: string) => string;
  /** a link target, e.g. a relative path resolved against the file */
  href?: (url: string) => string;
}

const esc = (s: string) => s.replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escCode = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s: string) => s.replace(/"/g, '&quot;');

export function renderInline(src: string, opts: InlineOpts = {}): string {
  const held: string[] = [];
  const hold = (html: string) => `\u0000${held.push(html) - 1}\u0000`;
  let s = src;
  // a backslash before a special character: the character itself
  s = s.replace(/\\([\\*`$~^=[\]])/g, (_, c: string) => hold(esc(c)));
  // code and math first: nothing inside them is markup
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _t, code: string) => hold(`<code>${escCode(code.trim())}</code>`));
  s = s.replace(/\$([^\s$](?:[^$\n]*[^\s$])?)\$(?!\d)/g, (m, t: string) => (opts.tex ? hold(opts.tex(t)) : m));
  s = esc(s);
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, t: string, u: string, title?: string) =>
    hold(`<a href="${attr(opts.href ? opts.href(u) : u)}"${title ? ` title="${attr(title)}"` : ''}>${t}</a>`));
  s = s.replace(/\[\[([^\]\n]+)\]\]/g, '<kbd>$1</kbd>');
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<![*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![*\w])/g, '<em>$1</em>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  s = s.replace(/==(?=\S)([\s\S]*?\S)==/g, '<mark>$1</mark>');
  s = s.replace(/(?<!~)~([^\s~]+)~(?!~)/g, '<sub>$1</sub>');
  s = s.replace(/\^([^\s^]+)\^/g, '<sup>$1</sup>');
  s = s.replace(/\n/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)]);
}

/** the text without its markup (for titles in the drawer and the presenter view) */
export function plainText(src: string): string {
  return renderInline(src).replace(/<br>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
