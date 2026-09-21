import { describe, expect, it } from 'vitest';
import { wedgePath, windRose } from './wind-rose';

describe('windRose', () => {
  it('bins by 16 sectors and speed band, north straddling 360°', () => {
    const { sectors, calm } = windRose([
      { dir: 355, kt: 4 },
      { dir: 5, kt: 12 },
      { dir: 90, kt: 25 },
      { dir: 180, kt: 0 },
    ]);
    expect(sectors).toHaveLength(16);
    expect(sectors[0]?.dir).toBe(0);
    expect(sectors[0]?.bands).toEqual([0.25, 0, 0.25, 0]);
    expect(sectors[4]?.bands).toEqual([0, 0, 0, 0.25]);
    expect(calm).toBe(0.25);
    const total = sectors.reduce((a, s) => a + s.total, 0) + calm;
    expect(total).toBeCloseTo(1, 10);
  });

  it('handles no observations and custom sector counts', () => {
    expect(windRose([]).sectors.every((s) => s.total === 0)).toBe(true);
    expect(windRose([{ dir: 45, kt: 8 }], 8).sectors[1]?.total).toBe(1);
    expect(windRose([{ dir: -90, kt: 8 }], 4).sectors[3]?.total).toBe(1);
  });
});

describe('wedgePath', () => {
  it('draws a closed annular sector starting at the inner radius', () => {
    const d = wedgePath(50, 50, 10, 40, -10, 10);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.match(/A /g)).toHaveLength(2);
    // North is up: the outer arc starts left of centre, above it.
    const [, x, y] = /L (\S+) (\S+)/.exec(d) ?? [];
    expect(Number(x)).toBeLessThan(50);
    expect(Number(y)).toBeLessThan(15);
    expect(wedgePath(0, 0, 1, 2, 0, 270)).toContain(' 0 1 1 ');
  });
});
