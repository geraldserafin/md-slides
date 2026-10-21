import { describe, expect, it } from 'vitest';
import { renderInline } from '../src/plugins/core-text/inline.ts';

const r = (s: string) => renderInline(s, { tex: (t) => `<tex>${t}</tex>` });

describe('renderInline', () => {
  it('formats', () => {
    expect(r('a **b** *c* ~~d~~ ==e== H~2~O x^2^')).toBe('a <strong>b</strong> <em>c</em> <del>d</del> <mark>e</mark> H<sub>2</sub>O x<sup>2</sup>');
  });
  it('code and math hold their content', () => {
    expect(r('`a < **b**` and $x^2 * y$')).toBe('<code>a &lt; **b**</code> and <tex>x^2 * y</tex>');
  });
  it('leaves plain technical text alone', () => {
    expect(r('snake_case, a * b * c, 5 < 6 & 7, cost $5 and $6')).toBe('snake_case, a * b * c, 5 &lt; 6 &amp; 7, cost $5 and $6');
  });
  it('links, keys and line breaks', () => {
    expect(renderInline('[x](a.png) [[Ctrl]]\nnext', { href: (u) => `/d/${u}` })).toBe('<a href="/d/a.png">x</a> <kbd>Ctrl</kbd><br>next');
  });
});
