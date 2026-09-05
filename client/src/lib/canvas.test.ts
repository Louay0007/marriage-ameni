import { describe, expect, it } from 'vitest';
import { normalizePoint } from './canvas';

describe('normalizePoint', () => {
  const bounds = { left: 10, top: 20, width: 200, height: 100 };

  it('normalizes a point against its canvas bounds', () => {
    expect(normalizePoint(110, 70, bounds, 42, 0.5)).toEqual({
      x: 0.5,
      y: 0.5,
      t: 42,
      pressure: 0.5,
    });
  });

  it('clamps points outside the canvas', () => {
    expect(normalizePoint(-50, 300, bounds, 10)).toEqual({ x: 0, y: 1, t: 10 });
  });
});
