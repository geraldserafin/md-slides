// "Single file" mode: the CLI embeds the deck files in window.__SLIDES_FILES__ as data: URIs
// (path relative to the page -> URI). Outside that mode fileUrl() returns the URL unchanged.
const embedded = (globalThis as { __SLIDES_FILES__?: Record<string, string> }).__SLIDES_FILES__;

export function fileUrl(url: string): string {
  if (!embedded) return url;
  const abs = new URL(url, document.baseURI).href;
  const dir = new URL('./', document.baseURI).href;
  if (!abs.startsWith(dir)) return url;
  const rel = decodeURIComponent(abs.slice(dir.length).replace(/[?#].*$/, ''));
  // once the chunk is inlined, `import.meta.url` is the page itself, not assets/
  return embedded[rel] ?? embedded[`assets/${rel}`] ?? url;
}
