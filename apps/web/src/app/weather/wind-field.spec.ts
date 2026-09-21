import { describe, expect, it } from 'vitest';
import { sampleWind, WindParticles, type WindGrid } from './wind-field';

const grid: WindGrid = {
  level: 250,
  time: 0,
  cols: 2,
  rows: 2,
  bbox: [0, 0, 10, 10],
  // SW, SE, NW, NE
  u: [0, 10, 20, 30],
  v: [5, 5, 5, 5],
};

describe('sampleWind', () => {
  it('interpolates bilinearly and clamps outside', () => {
    expect(sampleWind(grid, 0, 0)).toEqual([0, 5]);
    expect(sampleWind(grid, 10, 10)).toEqual([30, 5]);
    expect(sampleWind(grid, 5, 5)[0]).toBeCloseTo(15, 10);
    expect(sampleWind(grid, 0, 5)[0]).toBeCloseTo(5, 10);
    expect(sampleWind(grid, -50, 999)).toEqual([10, 5]);
  });

  it('survives a degenerate bbox', () => {
    expect(sampleWind({ ...grid, bbox: [1, 1, 1, 1] }, 1, 1)).toEqual([0, 5]);
  });
});

describe('WindParticles', () => {
  it('moves particles downwind and keeps them inside the view', () => {
    let seed = 1;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const eastward: WindGrid = { ...grid, u: [10, 10, 10, 10], v: [0, 0, 0, 0] };
    const p = new WindParticles(200, [0, 0, 10, 10], random);
    const before = Array.from(p.head);
    p.step(eastward, 16, 0.0001);
    let moved = 0;
    for (let i = 0; i < p.count; i++) {
      const lon = p.head[i * 2] ?? 0;
      const lat = p.head[i * 2 + 1] ?? 0;
      expect(lon).toBeGreaterThanOrEqual(0);
      expect(lon).toBeLessThanOrEqual(10);
      expect(lat).toBeGreaterThanOrEqual(0);
      expect(lat).toBeLessThanOrEqual(10);
      if (lon > (before[i * 2] ?? 0)) moved++;
    }
    expect(moved).toBeGreaterThan(150);
    // Tails trail behind heads (west of them for an eastward wind).
    expect(p.tail[0] ?? 0).toBeLessThanOrEqual(p.head[0] ?? 0);
  });

  it('respawns particles when the view changes', () => {
    const p = new WindParticles(50, [0, 0, 1, 1]);
    p.setView([100, 50, 101, 51]);
    for (let i = 0; i < p.count; i++) expect(p.head[i * 2] ?? 0).toBeGreaterThanOrEqual(100);
    // Particles blown out of the view come back inside.
    const storm: WindGrid = { ...grid, bbox: [100, 50, 101, 51], u: [1e6, 1e6, 1e6, 1e6] };
    p.step(storm, 16, 1);
    for (let i = 0; i < p.count; i++) expect(p.head[i * 2] ?? 0).toBeLessThanOrEqual(101);
  });
});
