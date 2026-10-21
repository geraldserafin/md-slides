// The DOM side of pictures, video, audio, charts and diagrams.
import { renderChart } from '../../chart';
import { renderDiagram } from '../../diagram';
import { fileUrl } from '../../files';
import type { PluginRuntime, RenderCtx } from '../../kernel/types.ts';

const fit = (ctx: RenderCtx, media: HTMLElement) => {
  const p = ctx.element.props;
  if (p.width) media.style.width = String(p.width);
  if (p.height) media.style.height = String(p.height);
};

export const runtime: PluginRuntime = {
  render: {
    image(ctx) {
      const p = ctx.element.props;
      ctx.el.classList.add('item-media');
      const img = document.createElement('img');
      img.src = fileUrl(String(p.src));
      img.alt = String(p.alt ?? '');
      if (p.fit) img.style.objectFit = String(p.fit);
      fit(ctx, img);
      ctx.el.append(img);
    },
    video(ctx) {
      const p = ctx.element.props;
      ctx.el.classList.add('item-media');
      const v = document.createElement('video');
      v.src = fileUrl(String(p.src));
      v.controls = p.controls !== false;
      v.muted = p.muted === true || p.autoplay === true;
      v.loop = p.loop === true;
      v.autoplay = p.autoplay === true;
      v.playsInline = true;
      fit(ctx, v);
      ctx.el.append(v);
    },
    audio(ctx) {
      // a player bar; it stops when the slide changes
      const p = ctx.element.props;
      ctx.el.classList.add('item-media', 'item-audio');
      const a = document.createElement('audio');
      a.src = fileUrl(String(p.src));
      a.controls = p.controls !== false;
      a.loop = p.loop === true;
      a.autoplay = p.autoplay === true;
      fit(ctx, a);
      ctx.el.append(a);
    },
    chart(ctx) {
      const p = ctx.element.props;
      ctx.el.classList.add('item-chart');
      const opts: Record<string, string> = { type: String(p.type), ...(p.title !== undefined ? { title: String(p.title) } : {}) };
      return `<div class="chart-box" style="${p.width ? `width:${p.width}` : ''}">${renderChart(String(p.csv), opts)}</div>`;
    },
    diagram(ctx) {
      ctx.el.classList.add('item-media', 'item-diagram');
      const box = document.createElement('div');
      box.className = 'diagram';
      fit(ctx, box);
      ctx.el.append(box);
      renderDiagram(box, String(ctx.element.props.text), () => ctx.relayout());
    },
  },
};
