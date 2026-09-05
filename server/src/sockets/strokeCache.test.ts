import { describe, expect, it } from 'vitest';
import { StrokeCache } from './strokeCache.js';

const batch = (id: string, count = 1) => ({
  strokeId: id,
  points: Array.from({ length: count }, (_, index) => ({
    x: index / count,
    y: 0.5,
    t: index,
  })),
  final: true,
});

describe('StrokeCache', () => {
  it('assigns sequences and returns isolated snapshots', () => {
    const cache = new StrokeCache();
    expect(
      cache.append('contract', 'party_a', batch(crypto.randomUUID())),
    ).toBe(1);
    expect(
      cache.append('contract', 'party_a', batch(crypto.randomUUID())),
    ).toBe(2);
    const snapshot = cache.snapshot('contract');
    expect(snapshot.sequences.party_a).toBe(2);
    expect(snapshot.strokes.party_a).toHaveLength(2);
    cache.clear('contract', 'party_a');
    expect(cache.snapshot('contract').strokes.party_a).toEqual([]);
  });

  it('enforces the point ceiling', () => {
    const cache = new StrokeCache(2);
    expect(() =>
      cache.append('contract', 'party_a', batch(crypto.randomUUID(), 3)),
    ).toThrow('STROKE_LIMIT');
  });
});
