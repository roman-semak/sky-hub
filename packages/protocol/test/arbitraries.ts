import type { EmergencyKind } from '@skytrace/adsb-types';
import fc from 'fast-check';
import type { AircraftRecord } from '../src/index.js';

const nullable = <T>(arb: fc.Arbitrary<T>): fc.Arbitrary<T | null> => fc.option(arb, { nil: null });

export const emergencyKind: fc.Arbitrary<EmergencyKind> = fc.constantFrom(
  'none',
  'general',
  'lifeguard',
  'minfuel',
  'nordo',
  'unlawful',
  'downed',
  'reserved',
);

export const record: fc.Arbitrary<AircraftRecord> = fc.record({
  icao: fc.integer({ min: 0, max: 0xffffff }),
  nonIcao: fc.boolean(),
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  lon: fc.double({ min: -180, max: 180, noNaN: true }),
  alt: nullable(fc.double({ min: -1000, max: 60_000, noNaN: true })),
  gs: nullable(fc.double({ min: 0, max: 1500, noNaN: true })),
  track: nullable(fc.double({ min: 0, max: 359.99, noNaN: true })),
  baroRate: nullable(fc.double({ min: -20_000, max: 20_000, noNaN: true })),
  squawk: nullable(fc.stringMatching(/^[0-7]{4}$/)),
  onGround: fc.boolean(),
  mlat: fc.boolean(),
  tisb: fc.boolean(),
  military: fc.boolean(),
  special: fc.boolean(),
  emergency: emergencyKind,
  category: nullable(fc.stringMatching(/^[A-D][0-7]$/)),
  age: fc.integer({ min: 0, max: 255 }),
});
