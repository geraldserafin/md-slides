// PDF z decku: node scripts/export-pdf.mjs <deck> [out.pdf] [--steps]
// Wymaga zbudowanego dist/ (npm run build) i Chromium (zmienna CHROMIUM albo `chromium` w PATH).
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';

const args = process.argv.slice(2);
const steps = args.includes('--steps');
const [deck, out = `${args[0]}.pdf`] = args.filter((a) => !a.startsWith('--'));
if (!deck) { console.error('użycie: export-pdf.mjs <deck> [out.pdf] [--steps]'); process.exit(1); }

const server = await preview({ preview: { port: 0, open: false } });
const base = server.resolvedUrls.local[0];
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM ?? 'chromium', headless: true, args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(`${base}?deck=${encodeURIComponent(deck)}&print=${steps ? 'steps' : 'slides'}`, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__printReady === true', { timeout: 60000 });
await page.pdf({ path: out, width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true });
await browser.close();
server.httpServer.close();
console.log(`zapisano ${out}`);
