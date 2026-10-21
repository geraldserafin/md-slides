// morph: what is on both sides of a change glides from its old place to the new one. Views are paired by key (an `id`, a picture's
// file); what has no partner enters and leaves the way the fade does. Code is not paired here: the code plugin morphs its own tokens.
import type { PluginRuntime, TransitionCtx, View } from '../../kernel/types.ts';

/** what moves: the picture / video / diagram itself (its wrapper spans the whole cell), else the item */
const boxOf = (el: HTMLElement): HTMLElement => (el.classList.contains('item-media') ? (el.firstElementChild as HTMLElement) ?? el : el);

/** media are the same when they show the same file (their size may differ), anything else when the markup is */
const sig = (el: HTMLElement) => (el.classList.contains('item-media') ? (el.querySelector<HTMLImageElement | HTMLVideoElement>('img,video')?.src ?? el.innerHTML) : el.innerHTML);

export const runtime: PluginRuntime = {
  transitions: {
    morph(ctx: TransitionCtx): number | void {
      const byKey = new Map<string, View>();
      for (const v of ctx.leaving) if (v.element.key && v.rect && !v.element.key.startsWith('code:')) byKey.set(v.element.key, v);
      const restEnter: View[] = [];
      if (!ctx.instant) {
        for (const v of ctx.entering) {
          const old = v.element.key ? byKey.get(v.element.key) : undefined;
          if (!old || !old.rect || !old.rect.width) { restEnter.push(v); continue; }
          const box = boxOf(v.el);
          const now = box.getBoundingClientRect();
          if (!now.width) { restEnter.push(v); continue; }
          const a = ctx.px(old.rect);
          const b = ctx.px(now);
          const same = sig(old.el) === sig(v.el); // the same content: one element travels; changed text cross-fades while it moves
          // the new view is in place at once; the old one goes away without a fade (one element travels, not two)
          ctx.show(v);
          v.el.style.transition = 'none';
          v.el.style.opacity = '1';
          v.el.style.transform = 'none';
          if (same) { old.el.style.transition = 'none'; old.el.style.opacity = '0'; }
          const s = Math.min(5, Math.max(0.2, a.w / (b.w || 1)));
          box.animate(
            [
              { transformOrigin: '0 0', transform: `translate(${a.x - b.x}px, ${a.y - b.y}px) scale(${s})`, opacity: same ? 1 : 0 },
              { transformOrigin: '0 0', transform: 'none', opacity: 1 },
            ],
            { duration: ctx.timing.move * 1000, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
          );
        }
      } else restEnter.push(...ctx.entering);
      // the rest goes the plain way
      return ctx.delegate('fade', restEnter, ctx.leaving);
    },
  },
};
