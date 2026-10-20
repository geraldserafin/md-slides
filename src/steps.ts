// A flat sequence of navigation steps. A section has one step per reveal stage (a `+++` line, or the next frame of
// a code group, takes a click). Animated code blocks are independent unless they share an id: blocks with the same id
// morph into each other from step to step -- also across sections and slides, as long as the id is shown in
// consecutive steps. Token keys are tracked through the WHOLE sequence, so the same token is the same DOM element
// from the first frame to the last and a CSS transition can move it.
import { isHidden, sectionItems, type Block, type Deck, type Frame, type Item, type Section } from './deck';
import { match, type Matching, type Tree } from './gumtree';
import { layoutBounds, layoutLeaves, type Placed } from './layout';
import { parseOne, type Lang } from './parse';

/** one animated code block as shown in one step */
export interface BlockState {
  block: Block;
  index: number; // index in Section.blocks
  groupKey: string; // what makes two blocks the same animation
  frame: Frame;
  lang: Lang;
  root: Tree;
  layout: Placed[];
  cols: number; // the widest frame of the block (a stable box for alignment and fitting)
  rows: number; // the tallest frame
  focus?: string; // lines to keep bright; the rest is dimmed
  transition: 'morph' | 'fade' | 'none'; // how this frame is entered
  keys: Map<number, string>; // treeId -> canonical token key (namespaced by the group)
  link?: { to: BlockState; m: Matching | 'same' }; // to the same group in the next step
  /** an autoplay block: its frames, played by the viewer's timer (the same states in every step of the section; this state is the first) */
  cycle?: BlockState[];
}

export interface Step {
  slide: number;
  section: Section;
  sectionIndex: number; // globally unique section number (to detect text changes)
  stage: number; // reveal stage shown in this step
  blocks: BlockState[]; // the animated code visible in this step
  /** how this step is entered from the previous one: morph (diff animation), fade (cross-fade), none (cut) */
  transition: 'morph' | 'fade' | 'none';
}

const parseTransition = (v: string | undefined): BlockState['transition'] => (v === 'fade' || v === 'none' ? v : 'morph');

/** the item that holds block `index` (its `at` is the stage the block appears at) */
function blockItem(section: Section, index: number): Item | undefined {
  return sectionItems(section).find((i) => i.kind === 'block' && i.block === index);
}

export async function buildSteps(deck: Deck): Promise<Step[]> {
  // parse every frame once (tabs -> 4 spaces: the monospace grid has no notion of tab stops)
  const parsed = new Map<Frame, { root: Tree; layout: Placed[] }>();
  const metrics = new Map<Block, { cols: number; rows: number }>();
  for (const slide of deck.slides)
    for (const section of isHidden(slide) ? [] : slide.sections)
      for (const block of section.blocks) {
        let cols = 0;
        let rows = 0;
        for (const frame of block.frames) {
          const code = frame.code.replace(/\t/g, '    ');
          const root = await parseOne(block.lang, code);
          const layout = layoutLeaves(code, root);
          parsed.set(frame, { root, layout });
          const b = layoutBounds(layout);
          cols = Math.max(cols, b.cols);
          rows = Math.max(rows, b.rows);
        }
        metrics.set(block, { cols, rows });
      }

  const steps: Step[] = [];
  let sectionIndex = 0;
  const cycles = new Map<Block, BlockState[]>();
  deck.slides.forEach((slide, si) => {
    if (isHidden(slide)) return;
    for (const section of slide.sections) {
      section.blocks.forEach((block, index) => {
        if (block.opts.autoplay === undefined || block.frames.length < 2) return;
        const mt = metrics.get(block)!;
        const states: BlockState[] = block.frames.map((frame) => {
          const p = parsed.get(frame)!;
          return {
            block, index, groupKey: `c${sectionIndex}:${block.id}`, frame, lang: block.lang, root: p.root, layout: p.layout, cols: mt.cols, rows: mt.rows,
            focus: frame.focus, transition: parseTransition(frame.transition), keys: new Map(),
          };
        });
        states.forEach((st, k) => {
          st.cycle = states;
          const next = states[k + 1];
          if (next && next.transition === 'morph' && st.lang === next.lang) st.link = { to: next, m: match(st.root, next.root) };
        });
        cycles.set(block, states);
      });
      for (let stage = 0; stage < section.stages; stage++) {
        const blocks: BlockState[] = [];
        section.blocks.forEach((block, index) => {
          const item = blockItem(section, index);
          if (!item || item.at > stage) return; // not revealed yet
          const cyc = cycles.get(block);
          if (cyc) { blocks.push(cyc[0]); return; }
          let frameIdx = 0;
          block.frames.forEach((f, k) => { if (f.at <= stage) frameIdx = k; });
          const frame = block.frames[frameIdx];
          if (frame.at > stage) return;
          const p = parsed.get(frame)!;
          const mt = metrics.get(block)!;
          blocks.push({
            block, index, groupKey: block.explicit ? `g:${block.id}` : `s${sectionIndex}:${block.id}`,
            frame, lang: block.lang, root: p.root, layout: p.layout, cols: mt.cols, rows: mt.rows,
            focus: frame.focus, transition: parseTransition(frame.transition), keys: new Map(),
          });
        });
        steps.push({ slide: si, section, sectionIndex, stage, blocks, transition: 'morph' });
      }
      sectionIndex++;
    }
  });

  // link every block state to the same group in the next step (matched when the code changed, identical when not)
  steps.forEach((step, i) => {
    const prevStep = steps[i - 1];
    if (!prevStep) return;
    for (const cur of step.blocks) {
      if (cur.cycle) continue;
      const prev = prevStep.blocks.find((b) => b.groupKey === cur.groupKey);
      if (!prev) continue;
      if (prev.frame === cur.frame) prev.link = { to: cur, m: 'same' };
      else if (cur.transition === 'morph' && prev.lang === cur.lang) prev.link = { to: cur, m: match(prev.root, cur.root) };
    }
    // the step's own transition: a cut if a block that appears or changes here asks for it
    const changed = step.blocks.filter((b) => {
      const prev = prevStep.blocks.find((p) => p.groupKey === b.groupKey);
      return !prev || prev.frame !== b.frame;
    });
    step.transition = changed.some((b) => b.transition === 'none') ? 'none' : changed.some((b) => b.transition === 'fade') ? 'fade' : 'morph';
  });

  // keys are computed from the end: a node inherits its partner's key from the next step
  const assign = (st: BlockState, tag: number) => {
    const link = st.link;
    const collect = (t: Tree) => {
      const partner = link ? (link.m === 'same' ? t.id : link.m.get(t.id)) : undefined;
      st.keys.set(t.id, (partner !== undefined && link!.to.keys.get(partner)) || `${st.groupKey}|k${tag}_${t.id}`);
      t.children.forEach(collect);
    };
    collect(st.root);
  };
  for (let i = steps.length - 1; i >= 0; i--) for (const st of steps[i].blocks) if (!st.cycle) assign(st, i);
  for (const states of cycles.values()) for (let k = states.length - 1; k >= 0; k--) assign(states[k], k);
  return steps;
}
