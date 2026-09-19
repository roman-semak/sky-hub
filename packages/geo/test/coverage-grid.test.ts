import { describe, expect, it } from 'vitest';
import { bboxContains, worldCoverageGrid } from '../src/index.js';

describe('worldCoverageGrid', () => {
  const grid = worldCoverageGrid();

  it('has unique ids and sane circles', () => {
    expect(new Set(grid.map((c) => c.id)).size).toBe(grid.length);
    expect(grid.length).toBeGreaterThan(40);
    expect(grid.length).toBeLessThan(200);
    for (const c of grid) {
      expect(c.radiusNm).toBe(250);
      expect(bboxContains(c.bbox, c.lat, c.lon)).toBe(true);
    }
  });

  it('covers major hubs', () => {
    const hubs: [number, number][] = [
      [50.03, 8.57],
      [38.77, -9.13],
      [40.64, -73.78],
      [33.94, -118.41],
      [35.55, 139.78],
      [25.25, 55.36],
    ];
    for (const [lat, lon] of hubs) {
      expect(grid.some((c) => bboxContains(c.bbox, lat, lon))).toBe(true);
    }
  });
});
