export const THEMES = ['dark', 'light', 'paper'] as const;
export type ThemeName = (typeof THEMES)[number];

export function applyTheme(name: string) {
  const t = (THEMES as readonly string[]).includes(name) ? name : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('slides-theme', t); } catch { /* prywatny tryb */ }
  return t;
}

export function nextTheme(): string {
  const cur = document.documentElement.dataset.theme ?? 'dark';
  return applyTheme(THEMES[(THEMES.indexOf(cur as ThemeName) + 1) % THEMES.length]);
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
  link.href = href;
  document.head.append(link);
}
