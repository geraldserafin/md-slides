// `slides new <dir>`: a starter deck (cover, bullets on clicks, animated code next to text, an ending) to edit.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const files = (title) => ({
  'deck.json': JSON.stringify({ title, author: '', theme: 'dark', footer: { left: title, right: '{slide} / {slides}' } }, null, 2) + '\n',
  '01-cover.slide': `<slide>
  layout: cover
  halign: center
  valign: center
</slide>

<h1>${title}</h1>
<p>A subtitle, or the date and where you give the talk</p>

<notes>Welcome everyone. Notes like this one show in the presenter window (press p).</notes>
`,
  '02-points.slide': `<h2>Bullets, one click each</h2>

<p>Everything outside a <c><step></c> is there from the start.</p>

<ul steps>
  <li>the first point</li>
  <li>the second point</li>
  <li>the third point</li>
</ul>
`,
  '03-code.slide': `<row>
  <col>
    <h2>Code that moves</h2>
    <p>Press → and the code changes: what stays, stays; what moved, glides.</p>
  </col>
  <code lang=ts>
    <frame>
      function total(items: number[]) {
        let sum = 0;
        for (const x of items) sum += x;
        return sum;
      }
    </frame>
    <frame>
      function total(items: number[]) {
        return items.reduce((sum, x) => sum + x, 0);
      }
    </frame>
  </code>
</row>
`,
  '99-end.slide': `<slide>
  layout: cover
  halign: center
  valign: center
</slide>

<h1>Thank you</h1>
<p>Questions?</p>
`,
});

export function newDeck(dir, title) {
  const out = resolve(dir);
  if (existsSync(out) && readdirSync(out).length) throw new Error(`${dir} exists and is not empty`);
  mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(files(title ?? basename(out)))) writeFileSync(join(out, name), text);
  return out;
}
