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
  focus?: string; // lines to keep bright (see Section.focus); the rest is dimmed
  /** how this step is entered from the previous one: morph (diff animation), fade (cross-fade), none (cut) */
  transition: 'morph' | 'fade' | 'none';
  lang?: Lang;
  textOnly: boolean; // section without a fence: a single column of text
  root?: Tree;
  layout: Placed[];
  keys: Map<number, string>; // treeId -> canonical key
}

const parseTransition = (v: string | undefined): Step['transition'] => (v === 'fade' || v === 'none' ? v : 'morph');

export async function buildSteps(deck: Deck): Promise<Step[]> {
  const steps: Step[] = [];
  let sectionIndex = 0;
  deck.slides.forEach((slide, si) => {
    for (const section of slide.sections) {
      // tabs -> 4 spaces: the monospace grid has no notion of tab stops
      const codes = section.codes.length ? section.codes.map((c) => c.replace(/\t/g, '    ')) : [''];
      for (const [fi, code] of codes.entries()) {
        steps.push({
          slide: si, section, sectionIndex, code, focus: section.focus[fi],
          transition: parseTransition(section.transition[fi]),
          lang: section.lang,
          textOnly: !section.hasFence,
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
    // fade/none: no shared tokens, so the old code fades out and the new one in (or is cut in)
    return b.transition === 'morph' && a.root && b.root && a.lang === b.lang ? match(a.root, b.root) : new Map();
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
