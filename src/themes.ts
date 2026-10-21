import type { DeckMeta } from './runtime/deck';
import { fileUrl } from './files';

export const BUILTIN_THEMES = ['dark', 'light', 'paper'];
let themeList = [...BUILTIN_THEMES];


export function applyTheme(name: string, persist = false) {
  const valid = themeList.includes(name);
  const t = valid ? name : 'dark';
  document.documentElement.dataset.theme = t;
  // persist only the user's explicit choice (the `t` key), not the starting theme
  if (valid && persist) try { localStorage.setItem('slides-theme', t); } catch { /* private mode */ }
  return t;
}

export function nextTheme(): string {
  const cur = document.documentElement.dataset.theme ?? 'dark';
  return applyTheme(themeList[(themeList.indexOf(cur) + 1) % themeList.length], true);
}

/** the OS color scheme: the fallback when neither the URL, a saved choice nor the deck names a theme */
export const systemTheme = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

/** a deck's (or the hub's) themes for light and dark mode: deck.json "schemes": { "light": "ink", "dark": "midnight" } */
export type Schemes = { light?: string; dark?: string };

let schemeDefault: 'light' | 'dark' | undefined;
/** the page's starting color scheme when the visitor has not chosen one (e.g. from the hub's own theme) */
export const setSchemeDefault = (s: 'light' | 'dark') => { schemeDefault = s; };

/** light or dark: the visitor's choice (the hub's toggle), else the page's default, else the OS */
export function colorScheme(): 'light' | 'dark' {
  try {
    const s = localStorage.getItem('slides-scheme');
    if (s === 'light' || s === 'dark') return s;
  } catch { /* private mode */ }
  return schemeDefault ?? systemTheme();
}

export function setColorScheme(s: 'light' | 'dark') {
  try { localStorage.setItem('slides-scheme', s); } catch { /* ignore */ }
}

/** the theme to use for a deck: its theme for the current color scheme, else its `theme`, else plain light/dark */
export const themeFor = (theme?: string, schemes?: Schemes) => schemes?.[colorScheme()] ?? theme ?? colorScheme();

export function initialTheme(deckTheme?: string, schemes?: Schemes): string {
  const q = new URLSearchParams(location.search).get('theme');
  let saved: string | null = null;
  try { saved = localStorage.getItem('slides-theme'); } catch { /* ignore */ }
  return applyTheme(q ?? saved ?? themeFor(deckTheme, schemes));
}

/** Load every font the deck declares before the first slide is laid out; a late swap would make text reflow (and everything under it jump). */
export async function preloadDeckFonts(meta: DeckMeta) {
  const loads = Promise.all((meta.fonts ?? []).map((f) =>
    document.fonts.load(`${f.style ?? 'normal'} ${f.weight ?? '400'} 20px "${f.family}"`).catch(() => [])));
  // never hold the deck hostage to a font that does not arrive
  await Promise.race([loads, new Promise((r) => setTimeout(r, 4000))]);
}

/** Extra deck stylesheet (deck.json: "css": "theme.css", relative to the deck folder). */
export function loadDeckCss(href: string) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = fileUrl(href);
  document.head.append(link);
}

/**
 * Declarative themes and fonts from deck.json:
 *   "themes": { "ocean": { "--bg": "#012", "--fg": "#cde" } }   -> [data-theme='ocean'] { ... }
 *   "fonts": [{ "family": "Fira Code", "src": "fira.woff2", "weight": "400" }]  (src relative to the deck folder)
 *   "googleFonts": ["Inter:wght@400;700", "Fira Code"]
 * New themes join the `t` key cycle.
 */
export function registerDeckStyle(meta: Pick<DeckMeta, 'themes' | 'fonts' | 'googleFonts'>, baseUrl: string) {
  const css: string[] = [];
  for (const [name, vars] of Object.entries(meta.themes ?? {})) {
    if (!themeList.includes(name)) themeList = [...themeList, name];
    const body = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
    css.push(`[data-theme='${CSS.escape(name)}']{${body}}`);
  }
  for (const f of meta.fonts ?? []) {
    const src = fileUrl(new URL(f.src, baseUrl).href);
    css.push(`@font-face{font-family:'${f.family}';src:url('${src}');font-weight:${f.weight ?? 'normal'};font-style:${f.style ?? 'normal'};font-display:block}`);
  }
  if (css.length) {
    const st = document.createElement('style');
    st.textContent = css.join('\n');
    document.head.append(st);
  }
  for (const g of meta.googleFonts ?? []) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(g).replace(/%3A/g, ':').replace(/%3B/g, ';').replace(/%40/g, '@').replace(/%20/g, '+')}&display=swap`;
    document.head.append(link);
  }
}
