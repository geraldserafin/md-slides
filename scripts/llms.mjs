// Writes the files for LLMs into a built site: llms.txt (docs/llms.txt) and llms-full.txt (the README and every slide of the
// manual decks, in order). Usage: node scripts/llms.mjs <site dir>
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'dist');
mkdirSync(out, { recursive: true });
copyFileSync('docs/llms.txt', join(out, 'llms.txt'));

const MANUAL = ['writing', 'code-animation', 'theming', 'presenting']; // the showcase repeats slides of these
const parts = [
  '# slides: full manual\n\nThe README followed by every slide of the manual decks (examples/writing, code-animation, theming, presenting). The manual is itself a set of decks: each feature is described on a slide that uses it.\n',
  '## README\n\n' + readFileSync('README.md', 'utf8'),
];
for (const deck of MANUAL)
  for (const f of readdirSync(join('examples', deck)).filter((f) => f.endsWith('.slides')).sort())
    parts.push(`## Manual slide: ${deck}/${f}\n\n\`\`\`\`text\n${readFileSync(join('examples', deck, f), 'utf8').trimEnd()}\n\`\`\`\``);
writeFileSync(join(out, 'llms-full.txt'), parts.join('\n\n') + '\n');
console.log(`llms.txt, llms-full.txt -> ${out}`);
