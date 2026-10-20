// ```chart fences: bar, line and pie charts drawn as inline SVG from a few CSV lines, in the slide's colors.
//
//   ```chart type=bar title="Build time (s)"
//   tool, cold, warm
//   webpack, 12, 4
//   vite, 3, 1
//   ```
// The first row names the series (the first cell is the label column); `type` is bar (default), line or pie.
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const PALETTE = ['var(--accent)', 'var(--tok-keyword)', 'var(--tok-type)', 'var(--tok-builtin)', 'var(--tok-property)', 'var(--tok-comment)'];
const W = 640;
const H = 360;

interface Data { labels: string[]; series: { name: string; values: number[] }[] }

export function parseChart(text: string): Data {
  const rows = text.trim().split('\n').map((l) => l.split(',').map((c) => c.trim())).filter((r) => r.some(Boolean));
  const [head, ...body] = rows;
  const names = head.slice(1);
  return {
    labels: body.map((r) => r[0]),
    series: names.map((name, i) => ({ name, values: body.map((r) => Number(r[i + 1]) || 0) })),
  };
}

/** a "nice" axis maximum and tick step for values up to `max` */
function niceAxis(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 0.25 };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { top: Math.ceil(max / step) * step, step };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

export function renderChart(text: string, opts: Record<string, string> = {}): string {
  const data = parseChart(text);
  const type = (opts.type ?? 'bar').toLowerCase();
  const title = opts.title ? `<text class="chart-title" x="${W / 2}" y="24" text-anchor="middle">${esc(opts.title)}</text>` : '';
  const out: string[] = [];
  const legendRow = type !== 'pie' && data.series.length > 1 ? 30 : 0; // the legend gets its own row under the title
  const head = opts.title ? 44 : 20;
  const top = head + legendRow;
  const left = 52;
  const bottom = H - 44;
  const right = W - 16;

  if (type === 'pie') {
    const vals = data.series[0]?.values ?? [];
    const sum = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = W * 0.34;
    const cy = (top + bottom) / 2 + 8;
    const r = Math.min(cx - 24, (bottom - top) / 2);
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (v / sum) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number, rad: number) => `${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`;
      const ir = r * 0.52;
      out.push(`<path class="chart-slice" style="animation-delay:${i * 0.08}s" fill="${PALETTE[i % PALETTE.length]}" d="M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, ir)} A ${ir} ${ir} 0 ${large} 0 ${p(a0, ir)} Z"/>`);
      const ly = top + 24 + i * 32;
      out.push(`<rect x="${W * 0.62}" y="${ly - 12}" width="14" height="14" rx="3" fill="${PALETTE[i % PALETTE.length]}"/><text class="chart-legend" x="${W * 0.62 + 22}" y="${ly}">${esc(data.labels[i] ?? '')} · ${Math.round((v / sum) * 100)}%</text>`);
      a0 = a1;
    });
  } else {
    const max = Math.max(0, ...data.series.flatMap((s) => s.values));
    const { top: yMax, step } = niceAxis(max);
    const y = (v: number) => bottom - (v / yMax) * (bottom - top);
    for (let t = 0; t <= yMax + 1e-9; t += step) {
      out.push(`<line class="chart-grid" x1="${left}" x2="${right}" y1="${y(t)}" y2="${y(t)}"/><text class="chart-tick" x="${left - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`);
    }
    const n = data.labels.length || 1;
    const band = (right - left) / n;
    data.labels.forEach((l, i) => out.push(`<text class="chart-label" x="${left + band * (i + 0.5)}" y="${bottom + 22}" text-anchor="middle">${esc(l)}</text>`));
    const k = data.series.length || 1;
    if (type === 'line') {
      data.series.forEach((s, si) => {
        const pts = s.values.map((v, i) => `${(left + band * (i + 0.5)).toFixed(1)},${y(v).toFixed(1)}`);
        out.push(`<polyline class="chart-line" pathLength="1" style="animation-delay:${si * 0.15}s" fill="none" stroke="${PALETTE[si % PALETTE.length]}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}"/>`);
        s.values.forEach((v, i) => out.push(`<circle class="chart-dot" cx="${left + band * (i + 0.5)}" cy="${y(v)}" r="4.5" fill="${PALETTE[si % PALETTE.length]}"/>`));
      });
    } else {
      const bw = Math.min(56, (band * 0.7) / k);
      data.series.forEach((s, si) => {
        s.values.forEach((v, i) => {
          const x = left + band * (i + 0.5) - (bw * k) / 2 + si * bw;
          out.push(`<rect class="chart-bar" style="animation-delay:${i * 0.06 + si * 0.04}s" x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${(bottom - y(v)).toFixed(1)}" rx="3" fill="${PALETTE[si % PALETTE.length]}"/>`);
          if (k === 1) out.push(`<text class="chart-value" x="${(x + (bw - 3) / 2).toFixed(1)}" y="${y(v) - 6}" text-anchor="middle">${fmt(v)}</text>`);
        });
      });
    }
    if (k > 1) {
      data.series.forEach((s, si) => {
        const lx = right - (data.series.length - si) * 130;
        out.push(`<rect x="${lx}" y="${head + 6}" width="14" height="14" rx="3" fill="${PALETTE[si % PALETTE.length]}"/><text class="chart-legend" x="${lx + 20}" y="${head + 19}">${esc(s.name)}</text>`);
      });
    }
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"${opts.title ? ` aria-label="${esc(opts.title)}"` : ''}>${title}${out.join('')}</svg>`;
}
