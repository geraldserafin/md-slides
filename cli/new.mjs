// `slides new <dir>`: a starter deck, one file (cover, bullets on clicks, animated code next to text, an ending) to edit.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const q = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const file = (title) => `// ${title}. Every \`slide\` is one slide; the layout follows from what is in it.
// Text goes in quotes. Inside it: **bold**, *italic*, \`code\`, [link](https://example.com), $x^2$.
deck title=${q(title)} author="" theme=dark {
  footer left=${q(title)} right="{slide} / {slide}s"
}

// a title and a line: the first slide of a deck is a cover
slide {
  title ${q(title)}
  text "A subtitle, or the date and where you give the talk"
  notes "Welcome everyone. Notes like this one show in the presenter window (press p)."
}

// a title and a list: "steps" shows one point per click
slide {
  title "Bullets, one click each"
  list steps {
    - "the first point"
    - "the second point"
    - "the third point"
  }
}

// text and code side by side; the code changes frame by frame (press → ) and the difference is animated
slide {
  title "Code that moves"
  text "Press → and the code changes: what stays, stays; what moved, glides."
  code "ts" {
    frame #"""
      function total(items: number[]) {
        let sum = 0;
        for (const x of items) sum += x;
        return sum;
      }
      """#
    frame #"""
      function total(items: number[]) {
        return items.reduce((sum, x) => sum + x, 0);
      }
      """#
  }
}

slide layout=cover {
  title "Thank you"
  text "Questions?"
}
`.replace('{slide}s', '{slides}');

export function newDeck(dir, title) {
  const out = resolve(dir);
  if (existsSync(out) && readdirSync(out).length) throw new Error(`${dir} exists and is not empty`);
  mkdirSync(out, { recursive: true });
  const name = title ?? basename(out);
  writeFileSync(join(out, `${basename(out)}.slides`), file(name));
  return out;
}
