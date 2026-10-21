// The settings of the whole deck: the `deck` node and what goes in it (vars, themes, fonts, header, footer, plugins, defaults,
// animation, code style, css). `deck.json` says the same in JSON.
import { str } from '../../kernel/util.ts';
import type { DeckMeta, KNode, KValue, Plugin, PropDef } from '../../kernel/types.ts';

const text = (v: KValue | undefined) => str(v);
const bool = (v: KValue | undefined) => (v === undefined ? undefined : v === true || v === 'true' || v === 'on' || v === 'yes');
const num = (v: KValue | undefined) => (typeof v === 'number' ? v : v === undefined ? undefined : Number(v) || undefined);
const strings = (p: Record<string, KValue>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]));
const drop = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

const bar = (n: KNode) => drop({
  left: text(n.props.left), center: text(n.props.center), right: text(n.props.right), height: num(n.props.height),
  background: text(n.props.background), color: text(n.props.color), border: bool(n.props.border), cover: bool(n.props.cover),
});

/** `deck title="…" { vars …; themes { … }; header …; plugins "a.js" }` as the settings of the deck */
export function deckFromNode(n: KNode): Partial<DeckMeta> {
  const p = n.props;
  const meta: Partial<DeckMeta> = drop({
    title: text(p.title), author: text(p.author), date: text(p.date), description: text(p.description), theme: text(p.theme),
    autoplay: num(p.autoplay), loop: bool(p.loop), thumbnail: text(p.thumbnail), hidden: bool(p.hidden),
    ...(p.order !== undefined ? { order: num(p.order) } : {}),
  });
  for (const c of n.children) {
    switch (c.name) {
      case 'vars': meta.vars = { ...meta.vars, ...strings(c.props) }; break;
      case 'themes': meta.themes = { ...meta.themes, ...Object.fromEntries(c.children.map((t) => [t.name, strings(t.props)])) }; break;
      case 'fonts': meta.fonts = c.children.filter((f) => f.name === 'font').map((f) => drop({ family: text(f.args[0]) ?? '', src: text(f.props.src) ?? '', weight: text(f.props.weight), style: text(f.props.style) })); break;
      case 'google-fonts': meta.googleFonts = [...(meta.googleFonts ?? []), ...c.args.map(String)]; break;
      case 'header': meta.header = bar(c); break;
      case 'footer': meta.footer = bar(c); break;
      case 'plugins': meta.plugins = [...(meta.plugins ?? []), ...c.args.map(String)]; break;
      case 'defaults': meta.defaults = strings(c.props); break;
      case 'css': meta.css = text(c.args[0]); break;
      case 'animation': {
        const a = c.props;
        meta.animation = drop({ move: num(a.move), fade: num(a.fade), ease: text(a.ease), textTransition: text(a.transition), textStagger: num(a.stagger) });
        break;
      }
      case 'code-style': {
        const a = c.props;
        meta.code = drop({ bg: text(a.bg), lines: bool(a.lines), radius: a.radius as never, pad: text(a.pad) });
        break;
      }
    }
  }
  return meta;
}

const HALIGN = ['left', 'center', 'right'];
const VALIGN = ['top', 'middle', 'bottom'];
const BOOL = ['#true', '#false'];
const barProps: Record<string, PropDef> = {
  left: { doc: 'text or image' }, center: { doc: 'text or image' }, right: { doc: 'text or image' },
  height: { doc: 'px', type: 'number' }, background: { doc: 'CSS background' }, color: { doc: 'text color' },
  border: { doc: 'a hairline between the bar and the slide', values: BOOL }, cover: { doc: 'also on cover slides', values: BOOL },
};

export const coreDeck: Plugin = {
  name: 'core-deck',
  api: 1,
  themes: { dark: {}, light: {}, paper: {} },
  nodes: {
    deck: {
      doc: 'Settings of the whole deck. Optional; once, at the top.',
      props: {
        title: { doc: 'the title of the deck' }, author: { doc: 'the author' }, date: { doc: 'the date' }, description: { doc: 'a line for the gallery' },
        theme: { doc: 'dark, light, paper, or one of the deck\'s themes', valuesFrom: 'themes' },
        autoplay: { doc: 'seconds per step: the deck plays itself', type: 'number' },
        loop: { doc: 'start again after the last step when autoplaying', values: BOOL }, thumbnail: { doc: 'gallery image instead of the first slide' },
        order: { doc: 'position in the gallery', type: 'number' }, hidden: { doc: 'not listed in the gallery', values: BOOL },
      },
      children: ['vars', 'themes', 'fonts', 'google-fonts', 'header', 'footer', 'plugins', 'defaults', 'animation', 'code-style', 'css'],
      top: {
        phase: 1,
        compile(n, top) {
          const { vars, themes, ...rest } = deckFromNode(n);
          Object.assign(top.meta, rest);
          if (vars) top.meta.vars = { ...top.meta.vars, ...vars };
          if (themes) top.meta.themes = { ...top.meta.themes, ...themes };
        },
      },
    },
    vars: { doc: 'CSS variables of the deck, e.g. `vars --accent="#d82838" --font-text="Georgia"`.' },
    themes: { doc: 'Own themes: `themes { sunset --bg="#2a1b2e" --fg="#f0d4c0" }`, one node per theme, its properties are CSS variables.' },
    fonts: { doc: 'Fonts to load: `font "Name" src="fonts/a.woff2" weight="400" style="normal"`.', children: ['font'] },
    font: { doc: 'A font file.', args: [{ name: 'family', doc: 'the font family' }], props: { src: { doc: 'the file' }, weight: { doc: 'e.g. 400' }, style: { doc: 'normal or italic' } } },
    'google-fonts': { doc: 'Google Fonts to load, by name: `google-fonts "Inter" "Lora"`.', args: [{ name: 'family', doc: 'a family' }], rest: true },
    header: { doc: 'A bar above every slide: `left`, `center`, `right` (text with {slide} {slides} {title} {slideTitle} {author} {date}, or an image file).', props: barProps },
    footer: { doc: 'A bar below every slide; the same as `header`.', props: barProps },
    plugins: { doc: 'Plugins (ES modules relative to the deck, or npm package names): `plugins "./qr.js"`.', args: [{ name: 'plugin', doc: 'a file or package' }], rest: true },
    defaults: {
      doc: 'Settings every slide gets unless it sets its own: `defaults align=center background="bg.jpg"`.',
      props: {
        justify: { doc: 'justified paragraphs', values: BOOL }, align: { doc: 'horizontal alignment', values: HALIGN }, valign: { doc: 'vertical alignment', values: VALIGN },
        background: { doc: 'a background' }, margin: { doc: 'space around the content (CSS)' }, transition: { doc: 'how content comes in', valuesFrom: 'transitions' },
      },
    },
    animation: {
      doc: 'Timings: `animation move=0.5 fade=0.3 transition=fade`.',
      props: {
        move: { doc: 'seconds, things move', type: 'number' }, fade: { doc: 'seconds, things fade', type: 'number' }, ease: { doc: 'CSS timing function' },
        transition: { doc: 'how a slide comes in when it names none', valuesFrom: 'transitions' }, stagger: { doc: 'seconds between text blocks', type: 'number' },
      },
    },
    'code-style': { doc: 'Look of every code block (a block\'s own properties win).', props: { bg: { doc: '`panel`, `none` or a color' }, lines: { doc: 'line numbers', values: BOOL }, radius: { doc: 'corner radius' }, pad: { doc: 'padding (CSS)' } } },
    css: { doc: 'A stylesheet of the deck: `css "deck.css"`.', args: [{ name: 'file', doc: 'the file' }] },
  },
};
