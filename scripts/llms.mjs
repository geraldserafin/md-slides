// Writes the files for LLMs into a built site: llms.txt (docs/llms.txt) and llms-full.txt (the README and every slide of
// the guide deck, in order). Usage: node scripts/llms.mjs <site dir>
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'dist');
mkdirSync(out, { recursive: true });
copyFileSync('docs/llms.txt', join(out, 'llms.txt'));

const parts = [
  '# slides: full manual\n\nThe README followed by every slide of the guide deck (examples/guide), which is itself a deck: each feature is described on the slide that uses it.\n',
  '## README\n\n' + readFileSync('README.md', 'utf8'),
];
for (const f of readdirSync('examples/guide').filter((f) => f.endsWith('.md')).sort())
  parts.push(`## Guide slide: ${f}\n\n\`\`\`\`markdown\n${readFileSync(join('examples/guide', f), 'utf8').trimEnd()}\n\`\`\`\``);
writeFileSync(join(out, 'llms-full.txt'), parts.join('\n\n') + '\n');
console.log(`llms.txt, llms-full.txt -> ${out}`);
