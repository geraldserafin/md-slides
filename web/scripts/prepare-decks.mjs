// node scripts/prepare-decks.mjs [foldery...]  (domyślnie ../slides ../slides-monads ./demo)
import { existsSync } from 'node:fs';
import { stageDecks } from '../cli/decks.mjs';

const dirs = process.argv.length > 2 ? process.argv.slice(2) : ['../slides', '../slides-monads', './demo'].filter(existsSync);
console.log(`decks: ${stageDecks(dirs, 'public').map((d) => d.name).join(', ')}`);
