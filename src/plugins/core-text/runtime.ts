// The DOM side of the text nodes: HTML from the text, with the markup inside it.
import katex from 'katex';
import { fileUrl } from '../../files';
import type { PluginRuntime, Render, RenderCtx } from '../../kernel/types.ts';
import { renderInline } from './inline.ts';
import type { ListSpec } from './index.ts';

const tex = (src: string, display: boolean) => katex.renderToString(src, { displayMode: display, throwOnError: false, output: 'html' });

export const inline = (ctx: RenderCtx, text: string) =>
  renderInline(text, { tex: (t) => tex(t, false), href: (u) => (/^(#|[a-z]+:)/i.test(u) ? u : fileUrl(new URL(u, ctx.base).href)) });

const sized = (el: Record<string, unknown>) => (el.size === 'small' || el.size === 'large' ? ` class="size-${el.size}"` : '');

const tagged = (cls: string, html: (ctx: RenderCtx) => string): Render => (ctx) => {
  ctx.el.classList.add(cls);
  return html(ctx);
};

const listHtml = (ctx: RenderCtx, spec: ListSpec): string => {
  const tag = spec.numbered ? 'ol' : 'ul';
  const items = spec.items.map((li) => `<li>${inline(ctx, li.text)}${li.children.map((c) => listHtml(ctx, c)).join('')}</li>`).join('');
  return `<${tag}${spec.numbered && spec.start && spec.start !== 1 ? ` start="${spec.start}"` : ''}>${items}</${tag}>`;
};

export const runtime: PluginRuntime = {
  render: {
    title: tagged('item-h1', (c) => `<h1>${inline(c, String(c.element.props.text))}</h1>`),
    heading: (c) => {
      const n = Math.min(6, Math.max(1, Math.round(Number(c.element.props.size) || 2)));
      c.el.classList.add(`item-h${n}`);
      return `<h${n}>${inline(c, String(c.element.props.text))}</h${n}>`;
    },
    text: tagged('item-paragraph', (c) => `<p${sized(c.element.props)}>${inline(c, String(c.element.props.text))}</p>`),
    quote: tagged('item-blockquote', (c) => {
      const p = c.element.props;
      return `<blockquote${sized(p)}>${inline(c, String(p.text))}${p.by !== undefined ? `<footer>${inline(c, String(p.by))}</footer>` : ''}</blockquote>`;
    }),
    list: tagged('item-list', (c) => listHtml(c, c.element.props as unknown as ListSpec)),
    table: tagged('item-table', (c) => {
      const p = c.element.props as { head?: string[]; rows: string[][] };
      const cells = (cs: string[], t: string) => cs.map((x) => `<${t}>${inline(c, x)}</${t}>`).join('');
      const head = p.head ? `<thead><tr>${cells(p.head, 'th')}</tr></thead>` : '';
      return `<table>${head}<tbody>${p.rows.map((r) => `<tr>${cells(r, 'td')}</tr>`).join('')}</tbody></table>`;
    }),
    math: tagged('item-math', (c) => `<div class="math-block">${tex(String(c.element.props.tex), true)}</div>`),
  },
};
