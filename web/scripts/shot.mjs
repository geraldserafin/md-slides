// Zrzuty ekranu przez headless Chromium: node scripts/shot.mjs <url> <out-prefix> <step...>
import puppeteer from 'puppeteer-core';
const [url, prefix, ...steps] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM ?? 'chromium', headless: true,
  args: ['--no-sandbox', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('response', (r) => r.status() >= 400 && console.log('HTTP', r.status(), r.url()));
page.on('console', (m) => console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(url, { waitUntil: 'networkidle0' });
for (const s of steps) {
  await page.evaluate((n) => { location.hash = '#' + n; }, s);
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${prefix}-${s}.png` });
}
await browser.close();
