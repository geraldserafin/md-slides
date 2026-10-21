// Code: the `code` node, and with it the reason the tool exists. Several `code`s in a `swap` are the states of one animated block:
// the diff of their syntax trees (GumTree) says what stays, what moves, what comes and goes, and the tokens of the code do just that.
// The same `id` in another `swap`, or on another slide, continues the animation. The drawing is in runtime.ts.
import { flagsOf, str, strs } from '../../kernel/util.ts';
import { walk } from '../../kernel/lower.ts';
import type { KNode, LowerCtx, Plugin, PropDef } from '../../kernel/types.ts';
import { LANGUAGES } from './languages.ts';

const FLAGS: Record<string, string> = { lines: 'line numbers', nolines: 'no line numbers', nopanel: 'no panel behind the code' };
const ALIGN: Record<string, PropDef> = {
  align: { doc: 'horizontal alignment', values: ['left', 'center', 'right'] },
  valign: { doc: 'vertical alignment', values: ['top', 'middle', 'bottom'] },
};

/** the code of a node: its first argument after the language that is not a flag */
const codeOf = (n: KNode) => n.args.slice(typeof n.args[0] === 'string' && !(n.args[0] in FLAGS) ? 1 : 0).find((x) => typeof x === 'string' && !(x in FLAGS));

function lowerCode(n: KNode, ctx: LowerCtx) {
  const lang = typeof n.args[0] === 'string' && !(n.args[0] in FLAGS) ? n.args[0] : undefined;
  const from = n.props.from !== undefined ? String(n.props.from) : undefined;
  const text = codeOf(n);
  if (from === undefined && lang === undefined) ctx.fail(n, '`code` needs a language: code "rust" "…"');
  if (from === undefined && text === undefined) ctx.fail(n, '`code` has no code: write it as the second argument: code "ts" "let a = 1;"');
  const animated = from !== undefined || !!ctx.registry.language(lang!);
  const opts = strs(n.props, ['id', 'from', 'focus', 'anim', 'align', 'valign']);
  if (n.props.align !== undefined) opts.halign = String(n.props.align);
  if (n.props.valign !== undefined) opts.valign = String(n.props.valign);
  const el = ctx.element('code', n, {
    lang: lang ?? '', text: String(text ?? ''), animated, ...(from !== undefined ? { from } : {}),
    ...(n.props.focus !== undefined ? { focus: String(n.props.focus) } : {}),
    classes: [...flagsOf(n, lang === undefined ? 0 : 1)].filter((f) => f in FLAGS), opts,
  });
  // the key is what makes states one animation: an `id`, or the language of code that sits directly in a `swap`
  const id = str(n.props.id);
  el.key = id !== undefined ? `code:@${id}` : ctx.direct && ctx.inherit.region ? `code:${ctx.inherit.region}:${lang ?? ''}` : `code:${ctx.uid('b')}`;
  return el;
}

export const code: Plugin = {
  name: 'code',
  api: 1,
  languages: LANGUAGES.map((l) => ({ ...l, wasm: '' })),
  nodes: {
    code: {
      doc: 'A block of code. Several `code`s in a `swap` are the states of one animated block: the diff between two is what moves. Blocks with the same `id` continue each other, also across slides.',
      part: true,
      args: [{ name: 'lang', doc: 'the language (ts, py, rust, go, cpp…)', optional: true }, { name: 'code', doc: 'the code', optional: true }],
      flags: FLAGS,
      props: {
        id: { doc: 'the animation: blocks with the same id are one (in other swaps, on other slides)' },
        from: { doc: 'show a copy of the last state of the earlier block with this id' },
        title: { doc: 'a caption above the code' }, start: { doc: 'number of the first line', type: 'number' }, size: { doc: 'font size in px', type: 'number' },
        fit: { doc: '`none` turns the automatic scaling off', values: ['none'] },
        focus: { doc: 'lines to keep bright, e.g. "2-4,7" (in a swap: for this state)' },
        bg: { doc: 'panel background color' }, radius: { doc: 'panel corner radius' }, pad: { doc: 'panel padding (CSS)' },
        ...ALIGN, anim: { doc: 'how it comes in', valuesFrom: 'effects' },
      },
      lower: lowerCode,
    },
  },
  passes: [
    // `code from="id"`: a copy of the last state of the earlier block with that id
    (program) => {
      const last = new Map<string, { lang: string; text: string; animated: boolean }>();
      for (const slide of program.slides)
        for (const e of walk(slide.root)) {
          if (e.kind !== 'code') continue;
          const p = e.props as { from?: string; lang: string; text: string; animated: boolean };
          if (p.from !== undefined) {
            const src = last.get(`code:@${p.from}`);
            if (!src) throw new Error(`code from="${p.from}": no earlier block with that id (${slide.url})`);
            p.lang = src.lang;
            p.text = src.text;
            p.animated = src.animated;
          } else if (e.key?.startsWith('code:@')) last.set(e.key, p);
        }
    },
  ],
  runtime: () => import('./runtime.ts').then((m) => m.runtime),
};
