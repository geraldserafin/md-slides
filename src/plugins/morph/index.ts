// `morph`: things that are on both sides of a change (the same `id`, the same picture, the same code) glide from where they were
// to where they are, instead of fading out and in. It pairs by key, so it needs to know nothing about what the things are.
import type { Plugin } from '../../kernel/types.ts';

export const morph: Plugin = {
  name: 'morph',
  api: 1,
  transitions: {
    morph: { doc: 'Elements with the same key (an `id`, a picture file) glide from their old place to the new one; the rest fades. Code in a swap morphs by the diff of its syntax trees (the code plugin).' },
  },
  runtime: () => import('./runtime.ts').then((m) => m.runtime),
};
