// Pictures, video, audio, charts and diagrams.
import { flagsOf, str, textArg } from '../../kernel/util.ts';
import type { Element, KNode, NodeDef, Plugin, PropDef } from '../../kernel/types.ts';

const ALIGN: Record<string, PropDef> = {
  align: { doc: 'horizontal alignment inside its part', values: ['left', 'center', 'right'] },
  valign: { doc: 'vertical alignment inside its part', values: ['top', 'middle', 'bottom'] },
};
const FX: Record<string, PropDef> = {
  anim: { doc: 'how it comes in', valuesFrom: 'effects' },
  id: { doc: 'morph id: the same id on the next slide glides between the two' },
};

const place = (n: KNode, p: Record<string, unknown>) => {
  for (const k of ['align', 'valign', 'width', 'height']) if (n.props[k] !== undefined) p[k] = String(n.props[k]);
  return p;
};

const media = (kind: string, doc: string, props: Record<string, PropDef>, flags: Record<string, string> = {}): NodeDef => ({
  doc, part: true,
  args: [{ name: 'src', doc: 'the file, relative to the .slides file' }],
  props: { width: { doc: 'CSS width' }, height: { doc: 'CSS height' }, ...props, ...ALIGN, ...FX },
  flags,
  lower(n, ctx) {
    const src = ctx.resolve(textArg(n, ctx, 'a file'));
    const f = flagsOf(n, 1);
    const p = place(n, { src });
    if (kind === 'image') p.alt = n.props.alt !== undefined ? String(n.props.alt) : '';
    if (n.props.fit !== undefined) p.fit = String(n.props.fit);
    for (const w of ['autoplay', 'loop', 'muted']) if (f.has(w)) p[w] = true;
    if (f.has('nocontrols')) p.controls = false;
    const el = ctx.element(kind, n, p);
    // the same picture on the next slide glides there by itself
    if (kind === 'image' && el.key === undefined) el.key = `img:${src}`;
    return el;
  },
});

export const coreMedia: Plugin = {
  name: 'core-media',
  api: 1,
  nodes: {
    image: media('image', 'An image.', { alt: { doc: 'alternative text' }, fit: { doc: 'how it fills its box', values: ['contain', 'cover'] } }),
    video: media('video', 'A video.', {}, { autoplay: 'play at once (muted)', loop: 'repeat', muted: 'no sound', nocontrols: 'hide the controls' }),
    audio: media('audio', 'An audio file with a player bar.', {}, { autoplay: 'play at once', loop: 'repeat', nocontrols: 'hide the bar' }),
    chart: {
      doc: 'CSV lines as an SVG chart; the first row names the series.', part: true,
      args: [{ name: 'type', doc: 'chart type', values: ['bar', 'line', 'pie'] }, { name: 'csv', doc: 'the data' }],
      props: { title: { doc: 'a title' }, width: { doc: 'CSS width' }, ...ALIGN, ...FX },
      lower(n, ctx) {
        const csv = str(n.args[1]);
        if (!csv) ctx.fail(n, '`chart` needs a type and the data: chart "bar" """ … """');
        return ctx.element('chart', n, place(n, { type: String(n.args[0]), csv, ...(n.props.title !== undefined ? { title: String(n.props.title) } : {}) }));
      },
    },
    diagram: {
      doc: 'A Mermaid diagram.', part: true, args: [{ name: 'mermaid', doc: 'the diagram source' }],
      props: { width: { doc: 'CSS width' }, ...ALIGN, ...FX },
      lower: (n, ctx) => ctx.element('diagram', n, place(n, { text: textArg(n, ctx, 'the diagram') })),
    },
  },
  runtime: () => import('./runtime.ts').then((m) => m.runtime),
};

export type { Element };
