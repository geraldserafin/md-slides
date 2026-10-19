import { describe, expect, it } from 'vitest';
import { fenceAlign, parseAlign, place, resolveAlign } from '../src/align';

describe('alignment model', () => {
  it('accepts start/center/end and the old words', () => {
    expect(['start', 'left', 'top', 'center', 'middle', 'end', 'right', 'bottom', 'x', undefined].map((v) => parseAlign(v)))
      .toEqual(['start', 'start', 'start', 'center', 'center', 'end', 'end', 'end', undefined, undefined]);
  });

  it('defaults to start everywhere', () => {
    expect(resolveAlign('valign', { own: {} }, false)).toBe('start');
    expect(resolveAlign('halign', { own: {} }, true)).toBe('start');
  });

  it('the columns default applies to two-column slides only', () => {
    const src = { own: {}, columns: { valign: 'center' } };
    expect(resolveAlign('valign', src, true)).toBe('center');
    expect(resolveAlign('valign', src, false)).toBe('start');
  });

  it('precedence: own front matter > columns > defaults', () => {
    const src = { own: { valign: 'end' }, defaults: { valign: 'start' }, columns: { valign: 'center' } };
    expect(resolveAlign('valign', src, true)).toBe('end');
    expect(resolveAlign('valign', { ...src, own: {} }, true)).toBe('center');
    expect(resolveAlign('valign', { ...src, own: {} }, false)).toBe('start');
  });

  it('fence classes and options', () => {
    expect(fenceAlign(['right', 'top'], {})).toEqual({ h: 'end', v: 'start' });
    expect(fenceAlign([], { halign: 'center', valign: 'end' })).toEqual({ h: 'center', v: 'end' });
    expect(fenceAlign(['left'], { halign: 'end' }).h).toBe('end'); // options beat classes
    expect(fenceAlign([], {})).toEqual({ h: undefined, v: undefined });
  });

  it('places a box in a space', () => {
    expect(place('start', 100, 40)).toBe(0);
    expect(place('center', 100, 40)).toBe(30);
    expect(place('end', 100, 40)).toBe(60);
    expect(place('end', 100, 140)).toBe(0); // never negative
  });
});
