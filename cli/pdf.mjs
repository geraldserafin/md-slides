// PDF z zbudowanego dist/: serwuje dist lokalnie i drukuje ?print= headless Chromium.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};

export function serveDir(dir) {
  const server = createServer((req, res) => {
    const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let p = join(dir, rel);
    if (rel.endsWith('/') || rel === '') p = join(p, 'index.html');
    if (!existsSync(p)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()] ?? 'application/octet-stream' });
    res.end(readFileSync(p));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  for (const c of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome']) {
    try { return execFileSync(process.platform === 'win32' ? 'where' : 'which', [c], { encoding: 'utf8' }).split('\n')[0].trim(); } catch { /* next */ }
  }
  throw new Error('Chromium/Chrome not found (set the CHROMIUM environment variable)');
}

/** jobs: [{ deck, out }] */
export async function exportPdfs(dist, jobs, steps) {
  const { server, url } = await serveDir(dist);
  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox'] });
  try {
    for (const { deck, out } of jobs) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`${url}?deck=${encodeURIComponent(deck)}&print=${steps ? 'steps' : 'slides'}`, { waitUntil: 'networkidle0' });
      await page.waitForFunction('window.__printReady === true', { timeout: 120000 });
      await page.pdf({ path: out, width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}
