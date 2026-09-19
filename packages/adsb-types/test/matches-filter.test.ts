import { describe, expect, it } from 'vitest';
import { isEmptyFilter, matchesFilter, normalizeAircraft } from '../src/index.js';

const base = normalizeAircraft(
  { hex: '4951ab', lat: 38.7, lon: -9.1, flight: 'TAP123', t: 'A20N', alt_baro: 20000, gs: 400 },
  0,
)!;

describe('matchesFilter', () => {
  it('matches everything with an empty filter', () => {
    expect(matchesFilter(base, {})).toBe(true);
    expect(isEmptyFilter({})).toBe(true);
    expect(isEmptyFilter({ types: [] })).toBe(true);
    expect(isEmptyFilter({ militaryOnly: true })).toBe(false);
  });

  it('applies ranges', () => {
    expect(matchesFilter(base, { altitude: [8000, 41000] })).toBe(true);
    expect(matchesFilter(base, { altitude: [25000, 41000] })).toBe(false);
    expect(matchesFilter(base, { speed: [0, 300] })).toBe(false);
    expect(matchesFilter({ ...base, gs: null }, { speed: [0, 300] })).toBe(false);
    expect(matchesFilter({ ...base, onGround: true, altBaro: 0 }, { altitude: [0, 100] })).toBe(
      true,
    );
  });

  it('applies list criteria', () => {
    expect(matchesFilter(base, { types: ['A20N', 'B738'] })).toBe(true);
    expect(matchesFilter(base, { types: ['B738'] })).toBe(false);
    expect(matchesFilter({ ...base, typeCode: null }, { types: ['B738'] })).toBe(false);
    expect(matchesFilter(base, { operators: ['TAP'] })).toBe(true);
    expect(matchesFilter(base, { operators: ['KLM'] })).toBe(false);
    expect(matchesFilter({ ...base, callsign: null }, { operators: ['KLM'] })).toBe(false);
    expect(matchesFilter(base, { countries: ['PT'] }, () => 'PT')).toBe(true);
    expect(matchesFilter(base, { countries: ['PT'] }, () => 'ES')).toBe(false);
    expect(matchesFilter(base, { countries: ['PT'] })).toBe(false);
  });

  it('applies flags', () => {
    expect(matchesFilter(base, { militaryOnly: true })).toBe(false);
    expect(matchesFilter({ ...base, military: true }, { militaryOnly: true })).toBe(true);
    expect(matchesFilter(base, { emergencyOnly: true })).toBe(false);
    expect(matchesFilter({ ...base, emergency: 'general' }, { emergencyOnly: true })).toBe(true);
    expect(matchesFilter(base, { laddOnly: true })).toBe(false);
    expect(matchesFilter({ ...base, ladd: true }, { laddOnly: true })).toBe(true);
  });
});
