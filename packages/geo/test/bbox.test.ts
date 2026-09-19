import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  bboxAroundPoint,
  bboxContains,
  bboxIntersects,
  bboxWidth,
  crossesAntimeridian,
  destinationPoint,
  splitBBox,
  type BBox,
} from '../src/index.js';
import { bearing, lat, lon } from './arbitraries.js';

describe('bbox', () => {
  const pacific: BBox = [170, -10, -170, 10];

  it('handles ordinary and antimeridian boxes', () => {
    expect(bboxContains([-10, 30, 10, 50], 40, 0)).toBe(true);
    expect(bboxContains([-10, 30, 10, 50], 60, 0)).toBe(false);
    expect(bboxContains([-10, 30, 10, 50], 40, 20)).toBe(false);
    expect(crossesAntimeridian(pacific)).toBe(true);
    expect(bboxContains(pacific, 0, 179)).toBe(true);
    expect(bboxContains(pacific, 0, -175)).toBe(true);
    expect(bboxContains(pacific, 0, 0)).toBe(false);
    expect(splitBBox(pacific)).toHaveLength(2);
    expect(bboxWidth(pacific)).toBe(20);
    expect(bboxWidth([0, 0, 10, 1])).toBe(10);
  });

  it('detects intersections, including across the antimeridian', () => {
    expect(bboxIntersects([0, 0, 10, 10], [5, 5, 15, 15])).toBe(true);
    expect(bboxIntersects([0, 0, 10, 10], [11, 0, 15, 10])).toBe(false);
    expect(bboxIntersects(pacific, [-175, -1, -160, 1])).toBe(true);
    expect(bboxIntersects(pacific, [0, -1, 10, 1])).toBe(false);
  });

  it('circle bbox contains every point of the circle', () => {
    fc.assert(
      fc.property(
        lat,
        lon,
        bearing,
        fc.double({ min: 1000, max: 400_000, noNaN: true }),
        (φ, λ, θ, r) => {
          const box = bboxAroundPoint(φ, λ, r);
          const p = destinationPoint(φ, λ, θ, r * 0.999);
          expect(bboxContains(box, p.lat, p.lon)).toBe(true);
        },
      ),
    );
  });

  it('widens to all longitudes near the poles', () => {
    const box = bboxAroundPoint(89.5, 0, 200_000);
    expect(box[0]).toBe(-180);
    expect(box[2]).toBe(180);
    expect(box[3]).toBe(90);
    const south = bboxAroundPoint(-89.5, 0, 200_000);
    expect(south[1]).toBe(-90);
  });
});
