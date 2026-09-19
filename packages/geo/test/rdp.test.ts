import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { simplifyRdp } from '../src/index.js';

type P = readonly [number, number];
const xy = (p: P): P => p;

function segDist(p: P, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}

describe('simplifyRdp', () => {
  it('keeps short inputs untouched', () => {
    expect(simplifyRdp([], 1, xy)).toEqual([]);
    expect(simplifyRdp([[0, 0]], 1, xy)).toEqual([[0, 0]]);
  });

  it('drops collinear points and keeps corners', () => {
    const pts: P[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
    ];
    expect(simplifyRdp(pts, 0.1, xy)).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
    ]);
  });

  it('handles closed loops (zero-length base segment)', () => {
    const pts: P[] = [
      [0, 0],
      [1, 1],
      [0, 0],
    ];
    expect(simplifyRdp(pts, 0.1, xy)).toHaveLength(3);
  });

  it('never deviates more than epsilon and keeps endpoints', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.double({ min: -10, max: 10, noNaN: true }),
            fc.double({ min: -10, max: 10, noNaN: true }),
          ),
          {
            minLength: 2,
            maxLength: 60,
          },
        ),
        fc.double({ min: 0.001, max: 2, noNaN: true }),
        (raw, eps) => {
          const pts = raw.map((p, i): P => [i, p[1]]);
          const out = simplifyRdp(pts, eps, xy);
          expect(out[0]).toBe(pts[0]);
          expect(out.at(-1)).toBe(pts.at(-1));
          let k = 0;
          for (const p of pts) {
            while (k < out.length - 2 && out[k + 1]![0] < p[0]) k++;
            const a = out[k]!;
            const b = out[k + 1]!;
            if (p[0] >= a[0] && p[0] <= b[0])
              expect(segDist(p, a, b)).toBeLessThanOrEqual(eps + 1e-9);
          }
        },
      ),
    );
  });
});
