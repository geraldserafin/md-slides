// Positions tree leaves on a monospace grid (row, col) based on the original
// source -- the "gap" between leaves (whitespace/indentation) only moves the
// cursor and is not rendered.
import { flatten, type Tree } from './gumtree.ts';

export interface Placed {
  tree: Tree;
  row: number;
  col: number;
}

export function layoutLeaves(src: string, root: Tree): Placed[] {
  const leaves = flatten(root)
    .filter((t) => t.children.length === 0)
    .sort((a, b) => a.start - b.start);
  const out: Placed[] = [];
  let pos = 0;
  let row = 0;
  let col = 0;
  for (const t of leaves) {
    const gap = src.slice(pos, Math.max(pos, t.start));
    const nl = gap.split('\n');
    if (nl.length > 1) {
      row += nl.length - 1;
      col = nl[nl.length - 1].length;
    } else col += gap.length;
    out.push({ tree: t, row, col });
    col += t.end - t.start;
    pos = t.end;
  }
  return out;
}

/** Content width/height in characters/rows. */
export function layoutBounds(l: Placed[]): { cols: number; rows: number } {
  let cols = 0;
  let rows = 0;
  for (const p of l) {
    cols = Math.max(cols, p.col + p.tree.text.length);
    rows = Math.max(rows, p.row + 1);
  }
  return { cols, rows };
}
