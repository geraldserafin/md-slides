// Tryb "single file": CLI osadza pliki decku w window.__SLIDES_FILES__ jako data: URI
// (ścieżka względem strony -> URI). Poza tym trybem fileUrl() zwraca URL bez zmian.
const embedded = (globalThis as { __SLIDES_FILES__?: Record<string, string> }).__SLIDES_FILES__;

export function fileUrl(url: string): string {
  if (!embedded) return url;
  const abs = new URL(url, document.baseURI).href;
  const dir = new URL('./', document.baseURI).href;
  if (!abs.startsWith(dir)) return url;
  const rel = decodeURIComponent(abs.slice(dir.length).replace(/[?#].*$/, ''));
  // po zinline'owaniu chunku `import.meta.url` to strona, a nie assets/
  return embedded[rel] ?? embedded[`assets/${rel}`] ?? url;
}
