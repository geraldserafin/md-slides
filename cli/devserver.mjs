// A tiny dev server for the prebuilt viewer: serves the staged decks over the viewer and reloads the page when told to.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.slide': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
// the page listens: "reload" after a change, "goto:<slide>:<section>" when the editor's cursor moves (an editor's preview follows it)
const RELOAD = '<script>new EventSource("/__reload").onmessage=(e)=>{if(e.data==="reload")location.reload();else if(e.data.startsWith("goto:")){const[,s,c]=e.data.split(":");window.__slideit?.goTo(+s,c===""?undefined:+c)}}</script>';

/** `roots`: folders searched in order (the staged decks, then the viewer). Returns { listen(port) -> url, reload() }. */
export function devServer(roots) {
  const clients = new Set();
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path === '/__reload') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(': ok\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (path === '/__goto') {
      const q = new URL(req.url, 'http://x').searchParams;
      if (/^\d+$/.test(q.get('slide') ?? '')) clients.forEach((c) => c.write(`data: goto:${q.get('slide')}:${/^\d+$/.test(q.get('section') ?? '') ? q.get('section') : ''}\n\n`));
      res.writeHead(204, { 'access-control-allow-origin': '*' }).end();
      return;
    }
    const rel = path.endsWith('/') ? `${path}index.html` : path;
    const file = roots.map((r) => join(r, rel)).find((p) => existsSync(p) && statSync(p).isFile());
    if (!file) { res.writeHead(404).end('not found'); return; }
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
    res.end(type.startsWith('text/html') ? readFileSync(file, 'utf8').replace('</body>', `${RELOAD}</body>`) : readFileSync(file));
  });
  return {
    reload: () => clients.forEach((c) => c.write('data: reload\n\n')),
    listen: (port = 5173) => new Promise((ok, fail) => {
      const tryPort = (p) => {
        server.once('error', (e) => (e.code === 'EADDRINUSE' && p < port + 50 ? tryPort(p + 1) : fail(e)));
        server.listen(p, '127.0.0.1', () => ok(`http://127.0.0.1:${p}/`));
      };
      tryPort(port);
    }),
  };
}
