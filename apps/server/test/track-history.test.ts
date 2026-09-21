import { describe, expect, it } from 'vitest';
import { TrackHistory } from '../src/history/track-history.js';
import { makeAircraft, T0 } from './fixtures.js';

describe('TrackHistory', () => {
  it('samples points at the minimum spacing and trims the window', () => {
    const h = new TrackHistory({ windowMs: 60_000, minSpacingMs: 10_000 });
    for (let s = 0; s <= 120; s += 2) h.record(makeAircraft({ posTime: T0 + s * 1000 }));
    const points = h.get('abcdef');
    expect(points.length).toBeGreaterThanOrEqual(6);
    expect(points.length).toBeLessThanOrEqual(7);
    expect(points[0]?.t).toBeGreaterThanOrEqual(T0 + 60_000);
    expect(h.aircraftCount).toBe(1);
  });

  it('filters by time and records ground as altitude 0', () => {
    const h = new TrackHistory();
    h.record(makeAircraft({ posTime: T0, onGround: true, altBaro: 0 }));
    h.record(makeAircraft({ posTime: T0 + 20_000 }));
    expect(h.get('abcdef', T0 + 1)).toHaveLength(1);
    expect(h.get('abcdef', 0, T0)[0]?.alt).toBe(0);
    expect(h.get('ffffff')).toEqual([]);
  });

  it('forgets evicted aircraft', () => {
    const h = new TrackHistory();
    h.record(makeAircraft());
    h.forget(['abcdef']);
    expect(h.aircraftCount).toBe(0);
  });
});
