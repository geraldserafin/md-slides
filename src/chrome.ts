// Header / footer bars (deck.json "header" / "footer"): a left, center and right slot, each holding
// text (with {placeholders}) and/or images such as a company logo.

export type Slot = string | string[];

export interface ChromeBar {
  left?: Slot;
  center?: Slot;
  right?: Slot;
  height?: number; // px (default 40)
  background?: string; // any CSS background
  color?: string;
  border?: boolean; // a hairline between the bar and the slide
  cover?: boolean; // also show on `layout: cover` slides (default: hidden there)
}

export interface ChromeContext {
  slide: number; // 1-based
  slides: number;
  title: string; // deck title
  slideTitle: string;
  author?: string;
  date?: string;
}

const IMAGE = /\.(svg|png|jpe?g|gif|webp|avif)(\?.*)?$/i;

export const isImage = (s: string) => IMAGE.test(s.trim());

/** {slide} {slides} {title} {slideTitle} {author} {date} */
export function expand(text: string, c: ChromeContext): string {
  const vals: Record<string, string> = {
    slide: String(c.slide), slides: String(c.slides), title: c.title, slideTitle: c.slideTitle,
    author: c.author ?? '', date: c.date ?? '',
  };
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vals ? vals[k] : m));
}

/** does any slot of the bar use the slide number? (then the built-in counter is redundant) */
export function usesSlideNumber(bar: ChromeBar | undefined): boolean {
  if (!bar) return false;
  return [bar.left, bar.center, bar.right].some((s) => [s ?? []].flat().some((t) => /\{slide\}/.test(t)));
}

export function renderSlot(el: HTMLElement, slot: Slot | undefined, ctx: ChromeContext, resolve: (src: string) => string) {
  el.replaceChildren();
  for (const item of [slot ?? []].flat()) {
    if (isImage(item)) {
      const img = document.createElement('img');
      img.src = resolve(item.trim());
      img.alt = '';
      el.append(img);
    } else {
      const span = document.createElement('span');
      span.textContent = expand(item, ctx);
      el.append(span);
    }
  }
}

/** show the bar on this slide? `footer: off` (or false/none/no) in the front matter hides it */
export function barVisible(bar: ChromeBar | undefined, meta: Record<string, string>, key: 'header' | 'footer'): boolean {
  if (!bar) return false;
  if (/^(off|false|none|no|hide)$/i.test(meta[key] ?? '')) return false;
  if (meta.layout === 'cover' && !bar.cover && meta[key] === undefined) return false;
  return true;
}
