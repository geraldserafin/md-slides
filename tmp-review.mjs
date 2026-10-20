// screenshots the last step of every slide: node tmp-review.mjs <dist> <outdir> deck...   (SCHEME=dark for dark mode)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serveDir } from './cli/pdf.mjs';
const [dist, out, ...decks] = process.argv.slice(2);
const { server, url } = await serveDir(dist);
const b = await puppeteer.launch({ executablePath: process.env.CHROMIUM, headless: true, args: ['--no-sandbox'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });
for (const deck of decks) {
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: process.env.SCHEME || 'light' }]);
  await p.goto(`${url}?deck=${deck}#1`, { waitUntil: 'networkidle0' }); await wait(1800);
  const slideAt = () => p.evaluate(() => Number(document.querySelector('.counter')?.textContent.split('/')[0]));
  const last = new Map();
  for (let s = 1; s < 600; s++) {
    await p.evaluate((x) => (location.hash = '#' + x), s); await wait(35);
    const sl = await slideAt();
    if (!Number.isFinite(sl) || (sl === 0)) break;
    last.set(sl, s);
    if (s > 1 && (await p.evaluate(() => document.querySelector('.stage') === null))) break;
    const total = await p.evaluate(() => Number(document.querySelector('.counter')?.textContent.split('/')[1]));
    if (sl >= total && last.get(sl) !== s) break;
  }
  for (const [sl, step] of last) {
    await p.evaluate((x) => (location.hash = '#' + x), step); await wait(1500);
    await p.screenshot({ path: `${out}/${deck}-${String(sl).padStart(2, '0')}.png` });
  }
  console.log(deck, last.size, 'slides');
  await p.close();
}
await b.close(); server.close();
