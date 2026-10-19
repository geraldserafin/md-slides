// Port exe/GumTree.hs: GumTree (Falleri et al., 2014) + dodatkowe sygnały
// (tekst nośnych liści, pozycja w pliku, "slot", relokacja przeniesionych
// fragmentów, lokalny leafPass). Źródło-agnostyczny: operuje na 'Tree'.

export interface Tree {
  id: number; // unikalne w obrębie JEDNEGO drzewa
  label: string;
  text: string; // niepuste tylko dla liści
  start: number;
  end: number;
  children: Tree[];
}

/** id z t1 -> id z t2 */
export type Matching = Map<number, number>;

const MIN_HEIGHT = 2;
const MIN_DICE = 0.5;
const MAX_SIZE = 100;
const MIN_TEXT_SIM = 0.5;
const RELOC_MIN_SIM = 0.7;

// ---- cache'owane własności węzłów ---------------------------------------

const flatCache = new WeakMap<Tree, Tree[]>();
const idsCache = new WeakMap<Tree, Set<number>>();
const heightCache = new WeakMap<Tree, number>();
const keyCache = new WeakMap<Tree, number>();
const bagCache = new WeakMap<Tree, Map<string, number>>();
const keyTable = new Map<string, number>();

export function flatten(t: Tree): Tree[] {
  let r = flatCache.get(t);
  if (!r) {
    r = [t];
    for (const c of t.children) for (const d of flatten(c)) r.push(d);
    flatCache.set(t, r);
  }
  return r;
}

function postOrder(t: Tree): Tree[] {
  const out: Tree[] = [];
  const go = (n: Tree) => {
    for (const c of n.children) go(c);
    out.push(n);
  };
  go(t);
  return out;
}

const size = (t: Tree) => flatten(t).length;
const isLeaf = (t: Tree) => t.children.length === 0;

export function height(t: Tree): number {
  let h = heightCache.get(t);
  if (h === undefined) {
    h = isLeaf(t) ? 0 : 1 + Math.max(...t.children.map(height));
    heightCache.set(t, h);
  }
  return h;
}

/** Interning (dokładny, bez kolizji): równość kluczy == izomorfizm poddrzew. */
function subtreeKey(t: Tree): number {
  let k = keyCache.get(t);
  if (k === undefined) {
    const s = isLeaf(t)
      ? `L${t.label}\u0001${t.text}`
      : `N${t.label}(${t.children.map(subtreeKey).join(',')})`;
    k = keyTable.get(s);
    if (k === undefined) {
      k = keyTable.size;
      keyTable.set(s, k);
    }
    keyCache.set(t, k);
  }
  return k;
}

function descIds(t: Tree): Set<number> {
  let s = idsCache.get(t);
  if (!s) {
    s = new Set(flatten(t).map((x) => x.id));
    idsCache.set(t, s);
  }
  return s;
}

function parentMap(root: Tree): Map<number, Tree> {
  const m = new Map<number, Tree>();
  for (const t of flatten(root)) for (const c of t.children) m.set(c.id, t);
  return m;
}

// ---- podobieństwa ---------------------------------------------------------

class State {
  m: Matching = new Map();
  used = new Set<number>(); // wartości m (id z t2)
  set(a: number, b: number) {
    this.m.set(a, b);
    this.used.add(b);
  }
  has1(t: Tree) {
    return this.m.has(t.id);
  }
  free2(t: Tree) {
    return !this.used.has(t.id);
  }
}

function dice(s: State, n1: Tree, n2: Tree): number {
  const d1 = flatten(n1);
  const denom = d1.length + size(n2);
  if (denom === 0) return 0;
  const ids2 = descIds(n2);
  let common = 0;
  for (const t of d1) {
    const m = s.m.get(t.id);
    if (m !== undefined && ids2.has(m)) common++;
  }
  return (2 * common) / denom;
}

/** Wielozbiór "nośnych" liści (label != text): identyfikatory, literały. */
function bagOf(t: Tree): Map<string, number> {
  let b = bagCache.get(t);
  if (!b) {
    b = new Map();
    if (isLeaf(t)) {
      if (t.label !== t.text) b.set(`${t.label}\u0001${t.text}`, 1);
    } else {
      for (const c of t.children)
        for (const [k, v] of bagOf(c)) b.set(k, (b.get(k) ?? 0) + v);
    }
    bagCache.set(t, b);
  }
  return b;
}

const bagSum = (b: Map<string, number>) => {
  let s = 0;
  for (const v of b.values()) s += v;
  return s;
};

function textSim(a: Tree, b: Tree): number {
  const b1 = bagOf(a);
  const b2 = bagOf(b);
  const s1 = bagSum(b1);
  const s2 = bagSum(b2);
  if (s1 + s2 === 0) return 1;
  let common = 0;
  for (const [k, v] of b1) {
    const w = b2.get(k);
    if (w !== undefined) common += Math.min(v, w);
  }
  return (2 * common) / (s1 + s2);
}

// ---- kontekst: sloty i pozycja --------------------------------------------

interface Ctx {
  slotKey1: Map<number, string>;
  slotKey2: Map<number, string>;
  byPath1: Map<string, Tree>;
  byPath2: Map<string, Tree>;
  sameSlot(a: Tree, b: Tree): boolean;
  posDist(a: Tree, b: Tree): number;
}

function mkCtx(root1: Tree, root2: Tree): Ctx {
  const paths = (root: Tree) => {
    const keys = new Map<number, string>();
    const byPath = new Map<string, Tree>();
    const go = (t: Tree, p: string) => {
      keys.set(t.id, p);
      byPath.set(p, t);
      t.children.forEach((c, i) => go(c, `${p}/${c.label}#${i}`));
    };
    go(root, '');
    return { keys, byPath };
  };
  const p1 = paths(root1);
  const p2 = paths(root2);
  const end1 = Math.max(1, root1.end);
  const end2 = Math.max(1, root2.end);
  return {
    slotKey1: p1.keys,
    slotKey2: p2.keys,
    byPath1: p1.byPath,
    byPath2: p2.byPath,
    sameSlot: (a, b) => p1.keys.get(a.id) === p2.keys.get(b.id),
    posDist: (a, b) => Math.abs(a.start / end1 - b.start / end2),
  };
}

// ---- Faza 1 ---------------------------------------------------------------

function matchWhole(s: State, t1: Tree, t2: Tree) {
  s.set(t1.id, t2.id);
  const n = Math.min(t1.children.length, t2.children.length);
  for (let i = 0; i < n; i++) matchWhole(s, t1.children[i], t2.children[i]);
}

function topDownMatch(ctx: Ctx, root1: Tree, root2: Tree, s: State) {
  const maxH = (l: Tree[]) => l.reduce((a, t) => Math.max(a, height(t)), -1);
  const expand = (l: Tree[], mh: number) => [
    ...l.filter((t) => height(t) !== mh),
    ...l.filter((t) => height(t) === mh).flatMap((t) => t.children),
  ];

  // para izomorficzna w INNYM slocie, gdy a ma w t2 własnego slotowego partnera
  // tego samego typu (np. ciało funkcji vs identyczny blok zagnieżdżony w `try`)
  const slotAgrees = (a: Tree, b: Tree) => {
    if (ctx.sameSlot(a, b)) return true;
    const mate = ctx.byPath2.get(ctx.slotKey1.get(a.id)!);
    return !(mate && mate.id !== b.id && mate.label === a.label);
  };

  let l1 = [root1];
  let l2 = [root2];
  const amb: [Tree, Tree][] = [];

  for (;;) {
    const mh1 = maxH(l1);
    const mh2 = maxH(l2);
    if (Math.min(mh1, mh2) < MIN_HEIGHT) break;
    if (mh1 > mh2) {
      l1 = expand(l1, mh1);
      continue;
    }
    if (mh2 > mh1) {
      l2 = expand(l2, mh2);
      continue;
    }
    const top1 = l1.filter((t) => height(t) === mh1);
    const top2 = l2.filter((t) => height(t) === mh2);
    const rest1 = l1.filter((t) => height(t) !== mh1);
    const rest2 = l2.filter((t) => height(t) !== mh2);

    const partners = (a: Tree) => top2.filter((b) => subtreeKey(a) === subtreeKey(b));
    const partnersR = (b: Tree) => top1.filter((a) => subtreeKey(a) === subtreeKey(b));

    const uniq: [Tree, Tree][] = [];
    const ambPs: [Tree, Tree][] = [];
    for (const a of top1) {
      const ps = partners(a);
      if (ps.length === 1 && partnersR(ps[0]).length === 1 && slotAgrees(a, ps[0])) {
        uniq.push([a, ps[0]]);
      }
      for (const b of ps) {
        if (ps.length > 1 || partnersR(b).length > 1) ambPs.push([a, b]);
      }
    }
    const usedA = new Set([...uniq, ...ambPs].map(([a]) => a.id));
    const usedB = new Set([...uniq, ...ambPs].map(([, b]) => b.id));
    const open1 = top1.filter((t) => !usedA.has(t.id));
    const open2 = top2.filter((t) => !usedB.has(t.id));
    for (const [a, b] of uniq) matchWhole(s, a, b);
    l1 = [...rest1, ...open1.flatMap((t) => t.children)];
    l2 = [...rest2, ...open2.flatMap((t) => t.children)];
    amb.push(...ambPs);
  }

  // wieloznaczne kopie: wg dice rodziców (stan po pętli), potem pozycja
  const par1 = parentMap(root1);
  const par2 = parentMap(root2);
  const parentDice = ([a, b]: [Tree, Tree]) => {
    const p1 = par1.get(a.id);
    const p2 = par2.get(b.id);
    return p1 && p2 ? dice(s, p1, p2) : 0;
  };
  const ranked = amb
    .map((p) => ({ p, d: parentDice(p) }))
    .sort((x, y) => y.d - x.d || x.p[0].id - y.p[0].id || x.p[1].id - y.p[1].id);
  for (const { p: [a, b] } of ranked) {
    if (s.has1(a) || s.used.has(b.id)) continue;
    matchWhole(s, a, b);
  }
}

// ---- Faza 2 ---------------------------------------------------------------

/** Pierwszy element o maksymalnym kluczu (przy remisach wygrywa wcześniejszy). */
function argmax<T>(xs: T[], key: (x: T) => number): T | undefined {
  let best: T | undefined;
  let bk = -Infinity;
  for (const x of xs) {
    const k = key(x);
    if (best === undefined || k > bk) {
      best = x;
      bk = k;
    }
  }
  return best;
}

function bottomUpMatch(ctx: Ctx, root1: Tree, root2: Tree, s: State) {
  const nodes2 = flatten(root2).filter((t) => !isLeaf(t));

  const slotOk = (a: Tree, b: Tree) =>
    ctx.sameSlot(a, b) && dice(s, a, b) >= 0.15 && textSim(a, b) >= 0.3;
  const strictOk = (a: Tree, b: Tree) => {
    const d = dice(s, a, b);
    return d > 0 && d >= MIN_DICE && textSim(a, b) >= MIN_TEXT_SIM;
  };

  for (const n1 of postOrder(root1)) {
    if (isLeaf(n1) || s.has1(n1)) continue;

    // n2 zarezerwowany dla "slotowego" partnera, który jeszcze czeka
    const reserved = (n2: Tree) => {
      if (ctx.sameSlot(n1, n2)) return false;
      const t = ctx.byPath1.get(ctx.slotKey2.get(n2.id)!);
      return !!t && t.id !== n1.id && !s.has1(t) && !isLeaf(t) && t.label === n2.label && slotOk(t, n2);
    };

    const scored: { score: number; n2: Tree }[] = [];
    for (const n2 of nodes2) {
      if (n2.label !== n1.label || !s.free2(n2)) continue;
      if (!(strictOk(n1, n2) || slotOk(n1, n2))) continue;
      if (reserved(n2)) continue;
      const score =
        dice(s, n1, n2) + textSim(n1, n2) + (ctx.sameSlot(n1, n2) ? 0.5 : 0) - 0.25 * ctx.posDist(n1, n2);
      scored.push({ score, n2 });
    }
    const slotted = scored.filter((p) => ctx.sameSlot(n1, p.n2));
    const pool = slotted.length ? slotted : scored;
    const best = argmax(pool, (p) => p.score);
    if (!best) continue;
    s.set(n1.id, best.n2.id);
    if (size(n1) < MAX_SIZE && size(best.n2) < MAX_SIZE) recover(ctx, s, n1, best.n2);
  }
}

/** Fragmenty, które się PRZENIOSŁY: całe poddrzewo niezmatchowane po obu stronach. */
function relocate(ctx: Ctx, root1: Tree, root2: Tree, s: State) {
  const carriers = (t: Tree) => flatten(t).filter((l) => isLeaf(l) && l.label !== l.text).length;
  const cands = (root: Tree) =>
    flatten(root)
      .filter((t) => !isLeaf(t) && carriers(t) >= 2)
      .map((t, i) => ({ t, i }))
      .sort((a, b) => size(b.t) - size(a.t) || a.i - b.i)
      .map((x) => x.t);
  const c1 = cands(root1);
  const c2 = cands(root2);
  const free1 = (t: Tree) => flatten(t).every((x) => !s.has1(x));
  const free2 = (t: Tree) => flatten(t).every((x) => s.free2(x));

  for (const exactOnly of [true, false]) {
    for (const n1 of c1) {
      if (!free1(n1)) continue;
      const ranked: { v: number; n2: Tree }[] = [];
      for (const n2 of c2) {
        if (n2.label !== n1.label || !free2(n2)) continue;
        const sc = exactOnly ? (subtreeKey(n1) === subtreeKey(n2) ? 2 : 0) : textSim(n1, n2);
        if (exactOnly ? sc <= 0 : sc < RELOC_MIN_SIM) continue;
        ranked.push({ v: sc - 0.25 * ctx.posDist(n1, n2), n2 });
      }
      const best = argmax(ranked, (r) => r.v);
      if (!best) continue;
      if (exactOnly) matchWhole(s, n1, best.n2);
      else {
        s.set(n1.id, best.n2.id);
        recover(ctx, s, n1, best.n2);
      }
    }
  }
}

/** LCS z tym samym rozstrzyganiem remisów co wersja Haskell. */
function lcs<T>(eq: (a: T, b: T) => boolean, xs: T[], ys: T[]): [T, T][] {
  const n = xs.length;
  const m = ys.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (eq(xs[i], ys[j])) L[i][j] = 1 + L[i + 1][j + 1];
      else L[i][j] = L[i + 1][j] >= L[i][j + 1] ? L[i + 1][j] : L[i][j + 1];
    }
  }
  const out: [T, T][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(xs[i], ys[j])) {
      out.push([xs[i], ys[j]]);
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/** Recovery w obrębie zmatchowanej pary: LCS dzieci (izomorfia, potem typ + tekst/slot). */
function recover(ctx: Ctx, s: State, n1: Tree, n2: Tree) {
  // slot sam w sobie to nie dowód: rodzic pary musi mieć własne potwierdzone podobieństwo
  const supported = dice(s, n1, n2) >= 0.3;
  const exact = (a: Tree, b: Tree) => subtreeKey(a) === subtreeKey(b);
  const loose = (a: Tree, b: Tree) =>
    a.label === b.label &&
    (isLeaf(a) ? a.text === b.text : textSim(a, b) >= MIN_TEXT_SIM || (supported && ctx.sameSlot(a, b)));
  for (const eq of [exact, loose]) {
    const f1 = n1.children.filter((c) => !s.has1(c));
    const f2 = n2.children.filter((c) => s.free2(c));
    for (const [a, b] of lcs(eq, f1, f2)) {
      s.set(a.id, b.id);
      recover(ctx, s, a, b);
    }
  }
}

/** Liście z nośnym tekstem bez pary, choć ich kontenery się zmatchowały. */
function leafPass(root2: Tree, root1: Tree, s: State) {
  const byId2 = new Map(flatten(root2).map((t) => [t.id, t] as const));
  const pairs = flatten(root1)
    .filter((a) => !isLeaf(a) && s.m.has(a.id))
    .map((a, i) => ({ a, b: byId2.get(s.m.get(a.id)!)!, i }))
    .sort((x, y) => size(x.a) - size(y.a) || x.i - y.i);
  const carrier = (l: Tree) => isLeaf(l) && l.label !== l.text;
  const key = (l: Tree) => `${l.label}\u0001${l.text}`;

  for (const { a, b } of pairs) {
    const ls1 = flatten(a).filter((l) => carrier(l) && !s.has1(l));
    const ls2 = flatten(b).filter((l) => carrier(l) && s.free2(l));
    const all1 = flatten(a).filter(carrier);
    const all2 = flatten(b).filter(carrier);
    // unikalność liczona wśród WSZYSTKICH liści zakresu (też już zmatchowanych)
    const uniqIn = (xs: Tree[], alls: Tree[], k: string) => {
      if (alls.filter((x) => key(x) === k).length !== 1) return undefined;
      const f = xs.filter((x) => key(x) === k);
      return f.length === 1 ? f[0] : undefined;
    };
    const planned: [Tree, Tree][] = [];
    for (const l1 of ls1) {
      const x = uniqIn(ls1, all1, key(l1));
      const y = uniqIn(ls2, all2, key(l1));
      if (x && y) planned.push([x, y]);
    }
    for (const [x, y] of planned) s.set(x.id, y.id);
  }
}

export function match(root1: Tree, root2: Tree): Matching {
  const ctx = mkCtx(root1, root2);
  const s = new State();
  topDownMatch(ctx, root1, root2, s);
  bottomUpMatch(ctx, root1, root2, s);
  relocate(ctx, root1, root2, s);
  bottomUpMatch(ctx, root1, root2, s);
  if (!s.m.has(root1.id) && root1.label === root2.label) {
    s.set(root1.id, root2.id);
    recover(ctx, s, root1, root2);
  }
  leafPass(root2, root1, s);
  return s.m;
}
