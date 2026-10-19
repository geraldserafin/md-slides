import type { DeckMeta } from './deck';
import { fileUrl } from './files';

export const BUILTIN_THEMES = ['dark', 'light', 'paper'];
let themeList = [...BUILTIN_THEMES];

export const themeNames = () => themeList;

export function applyTheme(name: string, persist = false) {
  const valid = themeList.includes(name);
  const t = valid ? name : 'dark';
  document.documentElement.dataset.theme = t;
  // zapisujemy tylko świadomy wybór użytkownika (klawisz t), nie motyw startowy
  if (valid && persist) try { localStorage.setItem('slides-theme', t); } catch { /* prywatny tryb */ }
  return t;
}

export function nextTheme(): string {
  const cur = document.documentElement.dataset.theme ?? 'dark';
  return applyTheme(themeList[(themeList.indexOf(cur) + 1) % themeList.length], true);
}

export function initialTheme(deckTheme?: string): string {
  const q = new URLSearchParams(location.search).get('theme');
  let saved: string | null = null;
  try { saved = localStorage.getItem('slides-theme'); } catch { /* ignore */ }
  return applyTheme(q ?? saved ?? deckTheme ?? 'dark');
}

/** Dodatkowy arkusz stylów decku (deck.json: "css": "theme.css", względem folderu decku). */
export function loadDeckCss(href: string) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = fileUrl(href);
  document.head.append(link);
}

/**
 * Deklaratywne motywy i fonty z deck.json:
 *   "themes": { "ocean": { "--bg": "#012", "--fg": "#cde" } }   -> [data-theme='ocean'] { ... }
 *   "fonts": [{ "family": "Fira Code", "src": "fira.woff2", "weight": "400" }]  (src względem folderu decku)
 *   "googleFonts": ["Inter:wght@400;700", "Fira Code"]
 * Nowe motywy dołączają do cyklu klawiszem `t`.
 */
export function registerDeckStyle(meta: DeckMeta, baseUrl: string) {
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
