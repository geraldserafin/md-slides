// Dist (vite build) -> one .html file: JS/CSS inline, deck files and grammars as data: URIs
// in window.__SLIDES_FILES__ (see src/files.ts). Works offline / from file://.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const MIME = {
  '.md': 'text/markdown', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm', '.ttf': 'font/ttf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.otf': 'font/otf', '.pdf': 'application/pdf',
};

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

export function inlineDist(dist, outFile, usedLangs, allLangs) {
  const files = {};
  for (const p of walk(dist)) {
    const rel = relative(dist, p).split(sep).join('/');
    if (rel === 'index.html' || rel.endsWith('.js') || rel.endsWith('.css')) continue;
    const g = /tree-sitter-([\w-]+?)(?:-[\w-]{8})?\.wasm$/.exec(rel);
    if (g && allLangs.has(g[1]) && !usedLangs.has(g[1])) continue; // grammar not used by the deck
    const mime = MIME[extname(p).toLowerCase()] ?? 'application/octet-stream';
    files[rel] = `data:${mime};base64,${readFileSync(p).toString('base64')}`;
  }
  let html = readFileSync(join(dist, 'index.html'), 'utf8');
  const safe = (s) => s.replace(/<\/(script|style)/gi, '<\\/$1');
  html = html.replace(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
    const js = readFileSync(join(dist, src), 'utf8');
    return `<script type="module">${safe(js)}</script>`;
  });
  html = html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) =>
    `<style>${safe(readFileSync(join(dist, href), 'utf8'))}</style>`);
  html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>/g, '');
  const data = `<script>window.__SLIDES_FILES__=${JSON.stringify(files).replace(/</g, '\\u003c')}</script>`;
  html = html.replace('</head>', `${data}</head>`);
  // an inline module runs after the document is parsed, so #app already exists
  writeFileSync(outFile, html);
  return Object.keys(files).length;
}
