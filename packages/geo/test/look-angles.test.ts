import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compassPoint, FEET_TO_M, haversineDistance, lookAngles } from '../src/index.js';
import { bearing, lat, lon } from './arbitraries.js';

describe('lookAngles', () => {
  it('reports straight up for an aircraft directly overhead', () => {
    const a = lookAngles(38.7, -9.1, 38.7, -9.1, 36_000);
    expect(a.elevation).toBeCloseTo(90, 6);
    expect(a.slantRangeM).toBeCloseTo(36_000 * FEET_TO_M, 3);
    expect(a.groundRangeM).toBe(0);
  });

  it('halves to 45° when height equals ground distance', () => {
    // 10 km north of the observer at 10 km altitude (curvature drop ~8 m).
    const altFt = 10_000 / FEET_TO_M;
    const north = 38.7 + 10_000 / 111_320;
    const a = lookAngles(38.7, -9.1, north, -9.1, altFt);
    expect(a.azimuth).toBeCloseTo(0, 1);
    expect(a.elevation).toBeCloseTo(45, 0.5);
  });

  it('drops below the horizon far away, once curvature dominates', () => {
    // A 35 000 ft aircraft 500 km away is hidden by the bulge of the Earth.
    const far = 38.7 + 500_000 / 111_320;
    expect(lookAngles(38.7, -9.1, far, -9.1, 35_000).elevation).toBeLessThan(0);
  });

  it('subtracts the observer elevation', () => {
    const high = lookAngles(38.7, -9.1, 38.75, -9.1, 10_000, 5_000);
    const low = lookAngles(38.7, -9.1, 38.75, -9.1, 10_000, 0);
    expect(high.elevation).toBeLessThan(low.elevation);
  });

  it('keeps azimuth, elevation and ranges consistent', () => {
    fc.assert(
      fc.property(
        lat,
        lon,
        bearing,
        fc.double({ min: 500, max: 300_000, noNaN: true }),
        fc.double({ min: 0, max: 45_000, noNaN: true }),
        (φ, λ, θ, distDeg, altFt) => {
          const dLat = (distDeg / 111_320) * Math.cos((θ * Math.PI) / 180);
          const acLat = Math.max(-85, Math.min(85, φ + dLat));
          const a = lookAngles(φ, λ, acLat, λ, altFt);
          expect(a.groundRangeM).toBeCloseTo(haversineDistance(φ, λ, acLat, λ), 3);
          expect(a.slantRangeM).toBeGreaterThanOrEqual(a.groundRangeM - 1e-6);
          expect(a.elevation).toBeGreaterThan(-90);
          expect(a.elevation).toBeLessThanOrEqual(90);
        },
      ),
    );
  });
});

describe('compassPoint', () => {
  it('names the sector', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(359)).toBe('N');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(200)).toBe('SSW');
    expect(compassPoint(-45)).toBe('NW');
  });
});
