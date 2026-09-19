import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeGeohash, encodeGeohash } from '../src/index.js';
import { lat, lon } from './arbitraries.js';

describe('geohash', () => {
  it('matches the reference value', () => {
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(encodeGeohash(38.77, -9.13, 3)).toBe('eyc');
  });

  it('decoded cell contains the encoded point', () => {
    fc.assert(
      fc.property(lat, lon, fc.integer({ min: 1, max: 9 }), (φ, λ, precision) => {
        const cell = decodeGeohash(encodeGeohash(φ, λ, precision));
        expect(Math.abs(cell.lat - φ)).toBeLessThanOrEqual(cell.latErr + 1e-9);
        expect(Math.abs(cell.lon - λ)).toBeLessThanOrEqual(cell.lonErr + 1e-9);
      }),
    );
  });

  it('rejects invalid characters', () => {
    expect(() => decodeGeohash('abc')).toThrow(/invalid geohash/);
  });
});
