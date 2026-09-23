import { describe, expect, it } from 'vitest';
import { CoverageScheduler } from '../src/ingest/coverage-scheduler.js';
import { makeCircle } from './fixtures.js';

const grid = [
  makeCircle('lis', 38.7, -9.1),
  makeCircle('fra', 50, 8.6),
  makeCircle('nyc', 40.6, -73.8),
];

describe('CoverageScheduler', () => {
  it('fetches the stalest circle first and skips in-flight ones', () => {
    const s = new CoverageScheduler(grid);
    const a = s.next(1000, false);
    const b = s.next(1000, false);
    const c = s.next(1000, false);
    expect(new Set([a?.circle.id, b?.circle.id, c?.circle.id]).size).toBe(3);
    expect(s.next(1000, false)).toBeNull();
    s.complete('lis', 2000, true);
    s.complete('fra', 3000, true);
    s.complete('nyc', 4000, false);
    expect(s.next(5000, false)?.circle.id).toBe('nyc');
    expect(s.next(5000, false)?.circle.id).toBe('lis');
  });

  it('prioritises circles clients are looking at', () => {
    const s = new CoverageScheduler(grid);
    for (const id of ['lis', 'fra', 'nyc']) {
      s.next(0, false);
      s.complete(id, id === 'fra' ? 10_000 : 1000, true);
    }
    s.setDemand([[7, 49, 10, 51]]);
    // fra is 9 s younger but watched, so it wins.
    expect(s.next(12_000, false)?.circle.id).toBe('fra');
    expect(s.snapshot(12_000)).toMatchObject({ demandedCircles: 1, circles: 3 });
  });

  it('creates dynamic fallback circles for uncovered viewports and drops them later', () => {
    const s = new CoverageScheduler(grid);
    s.setDemand([[30, -5, 32, -3]]);
    expect(s.snapshot(0).dynamicCircles).toBe(1);
    expect(s.next(0, false)?.fallback).toBe(false);
    const dyn = s.next(0, true);
    expect(dyn?.fallback).toBe(true);
    expect(dyn?.circle.id).toMatch(/^dyn-/);
    expect(dyn?.circle.radiusNm).toBeGreaterThan(10);
    // Same viewport again → same circle, not a duplicate.
    s.setDemand([[30, -5, 32, -3]]);
    expect(s.snapshot(0).dynamicCircles).toBe(1);
    s.complete(dyn?.circle.id ?? '', 100, true);
    s.setDemand([]);
    expect(s.snapshot(100).dynamicCircles).toBe(0);
    expect(s.next(200, true)).toBeNull();
    s.complete('missing', 0, true);
  });

  it('adds a fallback circle when the grid only clips the viewport', () => {
    const s = new CoverageScheduler(grid);
    // Mostly open Atlantic, with Lisbon's circle at the eastern edge: the
    // grid touches the view but covers almost none of it.
    s.setDemand([[-30, 30, -8, 45]]);
    expect(s.snapshot(0).dynamicCircles).toBe(1);
    expect(s.snapshot(0).demandedCircles).toBeGreaterThan(1);
  });

  it('leaves a viewport inside the grid to the community feeds', () => {
    const s = new CoverageScheduler(grid);
    s.setDemand([[-9.5, 38.3, -8.7, 39]]);
    expect(s.snapshot(0).dynamicCircles).toBe(0);
  });

  it('handles antimeridian viewports', () => {
    const s = new CoverageScheduler(grid);
    s.setDemand([[175, -20, -175, -10]]);
    const dyn = s.next(0, true);
    expect(Math.abs(dyn?.circle.lon ?? 0)).toBeGreaterThan(179);
  });

  it('lets demand win over never-fetched circles right after start', () => {
    const s = new CoverageScheduler(grid, 1_000_000);
    s.setDemand([[7, 49, 10, 51]]);
    expect(s.next(1_000_100, false)?.circle.id).toBe('fra');
    s.complete('fra', 1_000_200, true);
    // Two seconds later the watched circle is still preferred over cold ones.
    expect(s.next(1_002_200, false)?.circle.id).toBe('fra');
  });

  it('reports staleness', () => {
    const s = new CoverageScheduler(grid);
    expect(s.snapshot(0)).toMatchObject({ medianAgeMs: null, maxDemandedAgeMs: null });
    s.setDemand([[-10, 38, -8, 39]]);
    s.next(0, false);
    s.complete('lis', 1000, true);
    expect(s.snapshot(4000)).toMatchObject({ maxDemandedAgeMs: 3000, medianAgeMs: 3000 });
  });
});
