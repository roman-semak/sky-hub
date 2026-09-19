import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  lerpAngle,
  normalizeBearing,
  normalizeLon,
  shortestAngleDelta,
  toDeg,
  toRad,
} from '../src/index.js';
import { anyAngle } from './arbitraries.js';

describe('angles', () => {
  it('converts degrees and radians', () => {
    expect(toRad(180)).toBeCloseTo(Math.PI);
    expect(toDeg(Math.PI / 2)).toBeCloseTo(90);
  });

  it('normalizes bearings into [0, 360)', () => {
    fc.assert(
      fc.property(anyAngle, (a) => {
        const n = normalizeBearing(a);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(360);
        expect(Math.abs(Math.sin(toRad(n)) - Math.sin(toRad(a)))).toBeLessThan(1e-9);
      }),
    );
    expect(Object.is(normalizeBearing(-0), 0)).toBe(true);
  });

  it('normalizes longitudes into [-180, 180)', () => {
    expect(normalizeLon(190)).toBeCloseTo(-170);
    expect(normalizeLon(-190)).toBeCloseTo(170);
    expect(normalizeLon(180)).toBe(-180);
  });

  it('takes the short arc across north', () => {
    expect(shortestAngleDelta(359, 1)).toBeCloseTo(2);
    expect(shortestAngleDelta(1, 359)).toBeCloseTo(-2);
    expect(shortestAngleDelta(0, 180)).toBe(180);
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0);
  });

  it('short-arc delta is always within (-180, 180]', () => {
    fc.assert(
      fc.property(anyAngle, anyAngle, (a, b) => {
        const d = shortestAngleDelta(a, b);
        expect(d).toBeGreaterThan(-180);
        expect(d).toBeLessThanOrEqual(180);
      }),
    );
  });
});
