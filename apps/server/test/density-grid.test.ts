import { describe, expect, it } from 'vitest';
import { DensityGrid } from '../src/state/density-grid.js';
import { makeAircraft } from './fixtures.js';

const HOUR = 3_600_000;
const T = Date.UTC(2026, 8, 23, 10, 0, 0);

describe('DensityGrid', () => {
  it('counts airborne positions into half-degree cells', () => {
    const g = new DensityGrid();
    // Three fixes inside one cell, one in the next cell east.
    g.record(makeAircraft({ lat: 38.7, lon: -9.4 }), T);
    g.record(makeAircraft({ lat: 38.9, lon: -9.2 }), T);
    g.record(makeAircraft({ lat: 38.6, lon: -9.1 }), T);
    g.record(makeAircraft({ lat: 38.7, lon: -8.4 }), T);
    const cells = g.query([-11, 37, -8, 40], 100, T);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ count: 3, lat: 38.75, lon: -9.25 });
    expect(cells[1]?.count).toBe(1);
    expect(g.size).toBe(2);
  });

  it('ignores aircraft on the ground and cells outside the bbox', () => {
    const g = new DensityGrid();
    g.record(makeAircraft({ lat: 38.7, lon: -9.1, onGround: true }), T);
    g.record(makeAircraft({ lat: 50, lon: 8 }), T);
    expect(g.query([-11, 37, -8, 40], 100, T)).toEqual([]);
    expect(g.query([7, 49, 9, 51], 100, T)).toHaveLength(1);
  });

  it('keeps the poles and the antimeridian inside the grid', () => {
    const g = new DensityGrid();
    g.record(makeAircraft({ lat: 90, lon: 180 }), T);
    g.record(makeAircraft({ lat: -90, lon: -180 }), T);
    expect(g.size).toBe(2);
    const north = g.query([179, 89, 180, 90], 10, T);
    expect(north).toHaveLength(1);
    expect(north[0]?.lat).toBeLessThanOrEqual(90);
    expect(north[0]?.lon).toBeLessThanOrEqual(180);
    // The far corner must not alias onto the next row's first cell.
    expect(g.query([-180, 89, -179, 90], 10, T)).toEqual([]);
  });

  it('starts over when the clock steps back across an hour', () => {
    const g = new DensityGrid({ cellDeg: 0.5, hours: 3 });
    g.record(makeAircraft({ lat: 10, lon: 10 }), T);
    expect(g.query([9, 9, 11, 11], 10, T)[0]?.count).toBe(1);
    // An hour earlier: the window no longer covers what was counted.
    g.record(makeAircraft({ lat: 10, lon: 10 }), T - HOUR);
    expect(g.query([9, 9, 11, 11], 10, T - HOUR)[0]?.count).toBe(1);
    expect(g.size).toBe(1);
  });

  it('spans the antimeridian', () => {
    const g = new DensityGrid();
    g.record(makeAircraft({ lat: 0, lon: 179.7 }), T);
    g.record(makeAircraft({ lat: 0, lon: -179.7 }), T);
    g.record(makeAircraft({ lat: 0, lon: 0 }), T);
    expect(g.query([179, -1, -179, 1], 100, T)).toHaveLength(2);
  });

  it('rolls hourly buckets so the window stays at a day', () => {
    const g = new DensityGrid({ cellDeg: 0.5, hours: 3 });
    g.record(makeAircraft({ lat: 38.7, lon: -9.1 }), T);
    g.record(makeAircraft({ lat: 38.7, lon: -9.1 }), T + HOUR);
    expect(g.query([-11, 37, -8, 40], 100, T + HOUR)[0]?.count).toBe(2);
    // Three hours later the first bucket has been reused and cleared.
    g.record(makeAircraft({ lat: 38.7, lon: -9.1 }), T + 3 * HOUR);
    expect(g.query([-11, 37, -8, 40], 100, T + 3 * HOUR)[0]?.count).toBe(2);
    // A long gap empties the grid entirely.
    expect(g.query([-11, 37, -8, 40], 100, T + 50 * HOUR)).toEqual([]);
    expect(g.size).toBe(0);
  });

  it('returns the busiest cells first, up to the limit', () => {
    const g = new DensityGrid();
    for (let i = 0; i < 5; i++) {
      for (let n = 0; n <= i; n++) g.record(makeAircraft({ lat: 38 + i, lon: -9 }), T);
    }
    const top = g.query([-11, 30, -8, 50], 2, T);
    expect(top.map((c) => c.count)).toEqual([5, 4]);
  });
});
