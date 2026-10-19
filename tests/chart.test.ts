import { describe, expect, it } from 'vitest';
import { parseChart, renderChart } from '../src/chart';

describe('charts', () => {
  const csv = 'tool, cold, warm\nwebpack, 12, 4\nvite, 3, 1.2\n';
  it('parses a header and rows into series', () => {
    expect(parseChart(csv)).toEqual({
      labels: ['webpack', 'vite'],
      series: [{ name: 'cold', values: [12, 3] }, { name: 'warm', values: [4, 1.2] }],
    });
  });
  it('draws a bar per value, with a legend for several series', () => {
    const svg = renderChart(csv, { type: 'bar', title: 'T' });
    expect(svg.match(/class="chart-bar"/g)).toHaveLength(4);
    expect(svg).toContain('>cold<');
    expect(svg).toContain('aria-label="T"');
  });
  it('draws a line per series and a slice per value', () => {
    expect(renderChart(csv, { type: 'line' }).match(/<polyline/g)).toHaveLength(2);
    expect(renderChart('k,v\na,1\nb,3\n', { type: 'pie' }).match(/chart-slice/g)).toHaveLength(2);
  });
  it('escapes labels', () => {
    expect(renderChart('k,v\n<b>,1\n')).not.toContain('<b>');
  });
});
