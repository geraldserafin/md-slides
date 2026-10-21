/** the name of `options` closest to `s` (a typo), if any is close enough */
export function closest(s: string, options: string[]): string | undefined {
  const dist = (a: string, b: string) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  let best: string | undefined;
  let bestD = Math.max(2, Math.floor(s.length / 3)) + 1;
  for (const o of options) {
    const x = dist(s.toLowerCase(), o.toLowerCase());
    if (x < bestD) { best = o; bestD = x; }
  }
  return best;
}
