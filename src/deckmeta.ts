// The `deck` node of a .slides file -> the deck's settings (what deck.json holds). Pure: the CLI and the viewer both use it.
import type { DeckMeta } from './deck.ts';
import type { KNode, KValue } from './kdl.ts';

const text = (v: KValue | undefined) => (v === undefined || v === null ? undefined : String(v));
const bool = (v: KValue | undefined) => (v === undefined ? undefined : v === true || v === 'true' || v === 'on' || v === 'yes');
const num = (v: KValue | undefined) => (typeof v === 'number' ? v : v === undefined ? undefined : Number(v) || undefined);
const strings = (p: Record<string, KValue>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]));
const drop = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** header / footer: the slots are properties; several lines or images in one slot are repeated `left` etc. arguments */
function bar(n: KNode) {
  const p = n.props;
  const slot = (k: string) => text(p[k]);
  return drop({
    left: slot('left'), center: slot('center'), right: slot('right'), height: num(p.height), background: text(p.background), color: text(p.color),
    border: bool(p.border), cover: bool(p.cover),
  });
}

/** `deck title="…" { vars …; themes { … }; header …; plugins "a.js" }` */
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
        meta.animation = drop({ move: num(a.move), fade: num(a.fade), ease: text(a.ease), textTransition: text(a.transition) as never, textStagger: num(a.stagger) });
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
