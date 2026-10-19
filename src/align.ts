// Alignment model: everything is `start` unless told otherwise.
//   halign / valign: start | center | end   (front matter, deck.json "defaults" and "columns", fence options)
// `columns` is the deck-wide default for slides that actually show two columns (text + code in a side layout),
// `textOnly` the one for slides that show a single column of text and no code.
export type Align = 'start' | 'center' | 'end';

const WORDS: Record<string, Align> = {
  start: 'start', left: 'start', top: 'start',
  center: 'center', middle: 'center',
  end: 'end', right: 'end', bottom: 'end',
};

export const parseAlign = (v: string | undefined): Align | undefined => (v ? WORDS[v.trim().toLowerCase()] : undefined);

export interface AlignSources {
  own: Record<string, string>; // the slide's own front matter
  defaults?: Record<string, string>; // deck.json "defaults"
  columns?: Record<string, string>; // deck.json "columns": applies to two-column slides only
  textOnly?: Record<string, string>; // deck.json "textOnly": applies to slides without code only
}

export interface AlignContext {
  twoColumns: boolean;
  textOnly: boolean;
}

/** the slide's own value beats the shape-specific default (columns / textOnly), which beats the deck default, which beats `start` */
export function resolveAlign(key: 'halign' | 'valign', src: AlignSources, ctx: AlignContext): Align {
  return (
    parseAlign(src.own[key]) ??
    (ctx.twoColumns ? parseAlign(src.columns?.[key]) : undefined) ??
    (ctx.textOnly ? parseAlign(src.textOnly?.[key]) : undefined) ??
    parseAlign(src.defaults?.[key]) ??
    'start'
  );
}

/** fence classes / options of a code block: .left .center .right .top .middle .bottom, halign=, valign= */
export function fenceAlign(classes: string[], opts: Record<string, string>) {
  let h = parseAlign(opts.halign);
  let v = parseAlign(opts.valign);
  for (const c of classes) {
    if (['left', 'center', 'right'].includes(c)) h ??= parseAlign(c);
    if (['top', 'middle', 'bottom'].includes(c)) v ??= parseAlign(c);
  }
  return { h, v };
}

/** where a box of `size` sits in `space`, offset included */
export const place = (a: Align, space: number, size: number) =>
  a === 'start' ? 0 : a === 'center' ? Math.max(0, space - size) / 2 : Math.max(0, space - size);
