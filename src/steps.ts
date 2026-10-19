// A flat sequence of navigation steps + canonical token keys tracked through the
// WHOLE sequence (so transitions between sections/slides animate with the same
// mechanism: old code fades out, new code fades in, shared tokens move).
import type { Deck, Section } from './deck';
import { match, type Matching, type Tree } from './gumtree';
import { layoutLeaves, type Placed } from './layout';
import { parseOne, type Lang } from './parse';

export interface Step {
  slide: number;
  section: Section;
  sectionIndex: number; // globally unique section number (to detect text changes)
  code: string;
  lang?: Lang;
  centered: boolean; // section without a fence => block centered on screen
  root?: Tree;
  layout: Placed[];
  keys: Map<number, string>; // treeId -> canonical key
}

export async function buildSteps(deck: Deck): Promise<Step[]> {
  const steps: Step[] = [];
  let sectionIndex = 0;
  deck.slides.forEach((slide, si) => {
    for (const section of slide.sections) {
      // tabs -> 4 spaces: the monospace grid has no notion of tab stops
      const codes = section.codes.length ? section.codes.map((c) => c.replace(/\t/g, '    ')) : [''];
      for (const code of codes) {
        steps.push({
          slide: si, section, sectionIndex, code,
          lang: section.lang,
          centered: !section.hasFence,
          layout: [], keys: new Map(),
        });
      }
      sectionIndex++;
    }
  });

  for (const s of steps) {
    if (!s.lang) continue;
    s.root = await parseOne(s.lang, s.code);
    s.layout = layoutLeaves(s.code, s.root);
  }

  // matchings[i]: step i -> i+1 (empty if either side has no code or the languages differ)
  const matchings: Matching[] = steps.slice(0, -1).map((a, i) => {
    const b = steps[i + 1];
    return a.root && b.root && a.lang === b.lang ? match(a.root, b.root) : new Map();
  });

  // keys are computed from the end: a node inherits its partner's key from the next step
  for (let i = steps.length - 1; i >= 0; i--) {
    const st = steps[i];
    if (!st.root) continue;
    const later = i < steps.length - 1 ? steps[i + 1].keys : undefined;
    const m = matchings[i];
    const collect = (t: Tree) => {
      const id2 = m?.get(t.id);
      st.keys.set(t.id, (id2 !== undefined && later?.get(id2)) || `k${i}_${t.id}`);
      t.children.forEach(collect);
    };
    collect(st.root);
  }
  return steps;
}
