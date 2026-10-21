// A slides plugin: this file is loaded by the viewer before the slides are read. It adds two nodes (`timer` and `badge`), an effect
// (`anim=flip`), a transition (`transition=wipe`), a theme (press t), a toolbox button and a hook. See docs/plugins.md.
const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export default {
  name: 'demo',
  api: 1,

  nodes: {
    // `timer minutes=5` counts down from the moment the slide shows
    timer: {
      doc: 'A countdown clock.',
      part: true,
      props: { minutes: { doc: 'how long it runs (default 5)', type: 'number' } },
      render({ element, el }) {
        const total = Math.round((Number(element.props.minutes) || 5) * 60);
        const out = document.createElement('div');
        out.style.cssText = 'font: 700 4em var(--font-code, monospace); font-variant-numeric: tabular-nums';
        let left = total;
        const draw = () => { out.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; };
        const reset = () => { left = total; draw(); };
        draw();
        const tick = setInterval(() => {
          if (!el.isConnected) { clearInterval(tick); removeEventListener('demo-reset', reset); return; }
          if (left > 0) { left--; draw(); }
        }, 1000);
        addEventListener('demo-reset', reset);
        return out;
      },
    },

    // `badge "new" color=orange`: a string of HTML is fine too
    badge: {
      doc: 'A small colored label.',
      part: true,
      args: [{ name: 'text', doc: 'what it says' }],
      props: { color: { doc: 'a CSS color', values: ['orange', 'green', 'blue', 'red'] } },
      render({ element }) {
        const color = element.props.color ?? 'orange';
        const esc = String(element.props.text ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
        return `<span style="display:inline-block;padding:.1em .7em;border-radius:1em;background:${color};color:#111;font-weight:700">${esc}</span>`;
      },
    },
  },

  // `anim=flip`: the pose of a thing that is not there yet; it comes in by leaving it
  effects: {
    flip: { doc: 'Comes in turned away, like a card.', pose: 'transform: perspective(700px) rotateY(80deg)' },
  },

  // `transition=wipe` on a slide or a swap: what comes in is uncovered from the left
  transitions: {
    wipe: {
      doc: 'The new content is uncovered from the left.',
      run(ctx) {
        ctx.ghost?.remove();
        for (const v of ctx.leaving) ctx.hide(v);
        for (const v of ctx.entering) {
          ctx.show(v);
          if (ctx.instant) continue;
          v.el.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: ctx.timing.move * 1000 * 1.4, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
        }
      },
    },
  },

  themes: {
    sepia: { '--bg': '#f4ecd8', '--fg': '#433422', '--heading': '#2b1d0e', '--muted': '#8a7a62', '--accent': '#b5541c', '--code-bg': '#ebe0c6' },
  },

  tools: [
    { title: 'Restart the timers', icon: svg('<circle cx="12" cy="13" r="7"/><path d="M12 9v4l2 2M9 3h6"/>'), run: () => dispatchEvent(new Event('demo-reset')) },
  ],

  hooks: {
    step(api, { slide }) { document.body.dataset.slide = String(slide + 1); },
  },
};
