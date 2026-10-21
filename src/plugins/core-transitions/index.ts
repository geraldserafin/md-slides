// How things come and go. An *effect* (`anim=zoom`) is the pose of an element that is not there yet, in CSS: it comes in by leaving
// the pose and goes out by returning to it. A *transition* (`transition=slide-right` on a slide or a swap) moves all that
// enters and leaves at once; the entrance and exit of text are here, `morph` is a plugin of its own.
import type { Plugin } from '../../kernel/types.ts';

export const coreTransitions: Plugin = {
  name: 'core-transitions',
  api: 1,
  effects: {
    fade: { doc: 'Fades in, no movement.', pose: 'transform: none' },
    rise: { doc: 'Rises into place while it fades in (the default).', pose: 'transform: translateY(calc(var(--drift, 8px) * 2.5))' },
    zoom: { doc: 'Zooms in from a smaller size.', pose: 'transform: scale(0.82)' },
    left: { doc: 'Comes in from the left.', pose: 'transform: translateX(-6vmin)' },
    right: { doc: 'Comes in from the right.', pose: 'transform: translateX(6vmin)' },
    down: { doc: 'Comes down from above.', pose: 'transform: translateY(calc(var(--drift, 8px) * -2.5))' },
    blur: { doc: 'Comes into focus.', pose: 'transform: none; filter: blur(10px)', css: '&{transition-property: opacity, transform, filter}' },
    pop: {
      doc: 'Pops with a little overshoot.',
      pose: 'transform: scale(0.7)',
      css: '&:not(.pending){animation: slides-pop var(--anim-dur, 0.55s) cubic-bezier(0.2, 1.4, 0.4, 1) var(--anim-delay, 0s) both} @keyframes slides-pop{from{transform:scale(0.7);opacity:0}to{transform:none;opacity:1}}',
    },
    none: { doc: 'No animation: it is there or not.', pose: 'transform: none', css: '&.pending{transition:none}' },
  },
  transitions: {
    fade: { doc: 'The old content fades out while it lifts away, the new content rises into place (the default).' },
    slide: { doc: 'The new content rises from further down.' },
    'slide-right': { doc: 'The content travels to the right: the old leaves that way, the new comes in from the left.' },
    'slide-left': { doc: 'The content travels to the left: the old leaves that way, the new comes in from the right.' },
    zoom: { doc: 'The new content scales up while it fades in.' },
    none: { doc: 'A hard cut.' },
  },
  runtime: () => import('./runtime.ts').then((m) => m.runtime),
};
