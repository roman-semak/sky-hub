import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  destinationPoint,
  haversineDistance,
  initialBearing,
  METERS_PER_NM,
  shortestAngleDelta,
} from '../src/index.js';
import { bearing, lat, lon } from './arbitraries.js';

describe('great-circle math', () => {
  it('matches a known distance (LIS → LHR ≈ 1563 km)', () => {
    const d = haversineDistance(38.7813, -9.1359, 51.47, -0.4543);
    expect(d / 1000).toBeCloseTo(1563, -1);
  });

  it('distance is symmetric, non-negative and zero on identity', () => {
    fc.assert(
      fc.property(lat, lon, lat, lon, (a, b, c, d) => {
        const x = haversineDistance(a, b, c, d);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeCloseTo(haversineDistance(c, d, a, b), 3);
        expect(haversineDistance(a, b, a, b)).toBe(0);
      }),
    );
  });

  it('destination round-trips distance and bearing', () => {
    fc.assert(
      fc.property(
        lat,
        lon,
        bearing,
        fc.double({ min: 10, max: 500 * METERS_PER_NM, noNaN: true }),
        (φ, λ, θ, dist) => {
          const p = destinationPoint(φ, λ, θ, dist);
          expect(haversineDistance(φ, λ, p.lat, p.lon)).toBeCloseTo(dist, 0);
          // Bearing is ill-conditioned right at the poles; latitude is capped in the arbitrary.
          expect(Math.abs(shortestAngleDelta(initialBearing(φ, λ, p.lat, p.lon), θ))).toBeLessThan(
            1e-3,
          );
          expect(p.lon).toBeGreaterThanOrEqual(-180);
          expect(p.lon).toBeLessThan(180);
        },
      ),
    );
  });

  it('crosses the antimeridian cleanly', () => {
    const p = destinationPoint(0, 179.9, 90, 50_000);
    expect(p.lon).toBeLessThan(-179);
  });
});
