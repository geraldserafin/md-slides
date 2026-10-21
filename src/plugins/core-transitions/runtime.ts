// The transitions of text and everything that is not paired: how the content of a slide comes in and how the old one leaves, and how
// the views of a step come and go (fade: the CSS transition of their pose). `none` is a cut.
import type { PluginRuntime, TransitionCtx } from '../../kernel/types.ts';

const SLIDE_PX = 60; // px, how far content travels for `slide-right` / `slide-left`
/** direction of travel: +1 = to the right, -1 = to the left, 0 = none */
export const slideDir = (kind: string | undefined) => (kind === 'slide-right' ? 1 : kind === 'slide-left' ? -1 : 0);

/** where a view starts when it comes in at a slide change */
const entryPose = (kind: string, drift: number): string => ({
  fade: drift ? `translateY(${drift}px)` : '', slide: 'translateY(28px)', 'slide-right': `translateX(${-SLIDE_PX}px)`, 'slide-left': `translateX(${SLIDE_PX}px)`, zoom: 'scale(0.94)',
} as Record<string, string>)[kind] ?? '';

/** the new content of a slide comes in, one view after the other */
function enterAll(ctx: TransitionCtx, kind: string, baseDelay: number) {
  const stagger = slideDir(kind) ? 0 : ctx.timing.stagger; // content that travels moves as one piece
  const tf = entryPose(kind, ctx.timing.drift);
  ctx.entering.forEach((v, i) => {
    const t = v.el;
    t.style.transition = 'none';
    t.style.opacity = '0';
    t.style.transform = tf;
    void t.offsetWidth;
    const d = baseDelay + i * stagger;
    t.style.transition = `opacity calc(var(--fade-dur) * 1.3) ease-out ${d}s, transform var(--move-dur) var(--ease) ${d}s`;
    t.style.opacity = '1';
    t.style.transform = 'none';
  });
}

/** the old slide (a ghost) fades out while it lifts away, or drifts off to the side */
function leaveGhost(ctx: TransitionCtx, kind: string) {
  const grid = ctx.ghost?.firstElementChild as HTMLElement | null;
  if (!grid) return;
  const dir = slideDir(kind);
  grid.style.transition = `opacity ${ctx.timing.leave}s ease-out, transform ${ctx.timing.leave}s ease-out`;
  grid.style.opacity = '0';
  grid.style.transform = dir ? `translateX(${dir * SLIDE_PX}px)` : `translateY(${-ctx.timing.drift * 0.6}px)`;
}

/** the views of a step: they come and go by the CSS transition of their pose */
function reveal(ctx: TransitionCtx) {
  // a handover (a swap): the content moves as a whole. The new one comes from where its pose is, the old one goes the other way
  // (to the pose mirrored), so it looks like one move in one direction and not two pieces crossing
  const handover = ctx.leaving.length > 0 && ctx.entering.length > 0 && !ctx.instant;
  const t = handover ? getComputedStyle(ctx.entering[0].el).transform : 'none';
  const pose = t && t !== 'none' ? new DOMMatrixReadOnly(t) : undefined;
  for (const v of ctx.leaving) {
    ctx.hide(v);
    if (pose) v.el.style.transform = `translate(${-pose.m41}px, ${-pose.m42}px)`;
  }
  for (const v of ctx.entering) ctx.show(v);
  if (pose) {
    // once it is gone, the old one goes back to its pose (so that it comes in from the right side next time)
    setTimeout(() => {
      for (const v of ctx.leaving) {
        if (!v.el.classList.contains('pending')) continue;
        v.el.style.transition = 'none';
        v.el.style.transform = '';
        void v.el.offsetWidth;
        v.el.style.transition = '';
      }
    }, ctx.timing.move * 1000 + 60);
  }
}

const entrance = (kind: string) => (ctx: TransitionCtx): number | void => {
  if (ctx.scope === 'step') return reveal(ctx);
  if (ctx.instant) { ctx.ghost?.remove(); return; }
  // the old slide leaves in the way of its own transition; the new content waits a moment if there is an old one
  if (ctx.ghost) leaveGhost(ctx, ctx.from ?? kind);
  enterAll(ctx, kind, ctx.ghost ? ctx.timing.delay : 0);
  return ctx.timing.leave * 1000 + 50;
};

export const runtime: PluginRuntime = {
  transitions: {
    fade: entrance('fade'),
    slide: entrance('slide'),
    'slide-right': entrance('slide-right'),
    'slide-left': entrance('slide-left'),
    zoom: entrance('zoom'),
    none(ctx) {
      // a hard cut: the old goes, the new is there, nothing moves
      ctx.instant = true;
      ctx.ghost?.remove();
      if (ctx.scope === 'step') reveal(ctx);
      return 0;
    },
  },
};
