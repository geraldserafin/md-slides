// Entry script inside the executable (Node SEA; CommonJS because SEA in Node 24 cannot load ESM).
// Serves the embedded dist/ files on 127.0.0.1 and opens the browser. Options: --port N, --no-open.
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const { getAsset, getAssetKeys } = require('node:sea');

const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json',
  md: 'text/markdown; charset=utf-8', wasm: 'application/wasm', svg: 'image/svg+xml', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4',
  webm: 'video/webm', ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2', pdf: 'application/pdf',
};
const args = process.argv.slice(2);
const pi = args.indexOf('--port');
const port = pi >= 0 ? Number(args[pi + 1]) : 0;
const keys = new Set(getAssetKeys());

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  if (!keys.has(p)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[p.split('.').pop()] ?? 'application/octet-stream' });
  res.end(Buffer.from(getAsset(p)));
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`slideit: ${url}  (Ctrl+C to quit)`);
  if (args.includes('--no-open')) return;
  const [cmd, a] = process.platform === 'darwin' ? ['open', []] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '']] : ['xdg-open', []];
  try { spawn(cmd, [...a, url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* no browser available */ }
});
