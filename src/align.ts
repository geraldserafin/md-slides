// Alignment model: everything is `start` unless told otherwise.
//   halign / valign: start | center | end (also left right top middle bottom): the slide's properties, a layout's defaults, the deck's `defaults`
export type Align = 'start' | 'center' | 'end';

const WORDS: Record<string, Align> = {
  start: 'start', left: 'start', top: 'start',
  center: 'center', middle: 'center',
  end: 'end', right: 'end', bottom: 'end',
};

export const parseAlign = (v: string | undefined): Align | undefined => (v ? WORDS[v.trim().toLowerCase()] : undefined);

export interface AlignSources {
  own: Record<string, string>; // the slide's own properties (with its layout's defaults)
  defaults?: Record<string, string>; // the deck's `defaults`
}

/** the slide's own value beats the deck default, which beats `start` */
export function resolveAlign(key: 'halign' | 'valign', src: AlignSources): Align {
  return parseAlign(src.own[key]) ?? parseAlign(src.defaults?.[key]) ?? 'start';
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
