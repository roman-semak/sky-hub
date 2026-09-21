import { describe, expect, it } from 'vitest';
import {
  countryOfIcao24,
  ICAO24_BLOCK_COUNT,
  StaticIndex,
  type StaticDatasets,
} from '../src/index.js';

describe('countryOfIcao24', () => {
  it('resolves well-known blocks', () => {
    expect(countryOfIcao24('4951ab')).toBe('PT');
    expect(countryOfIcao24('3c6444')).toBe('DE');
    expect(countryOfIcao24('a1b2c3')).toBe('US');
    expect(countryOfIcao24('400000')).toBe('GB');
    expect(countryOfIcao24('43ffff')).toBe('GB');
    expect(countryOfIcao24('508123')).toBe('UA');
    expect(countryOfIcao24('780abc')).toBe('CN');
  });

  it('returns null for gaps, non-ICAO and garbage', () => {
    expect(countryOfIcao24('000001')).toBeNull();
    expect(countryOfIcao24('f00000')).toBeNull();
    expect(countryOfIcao24('~4951ab')).toBeNull();
    expect(countryOfIcao24('zzzzzz')).toBeNull();
  });

  it('keeps blocks sorted and disjoint', () => {
    expect(ICAO24_BLOCK_COUNT).toBeGreaterThan(100);
  });
});

const data: StaticDatasets = {
  version: 1,
  generatedAt: '2026-09-21T00:00:00Z',
  airports: [
    {
      icao: 'LPPT',
      iata: 'LIS',
      name: 'Humberto Delgado Airport',
      city: 'Lisbon',
      country: 'PT',
      lat: 38.78,
      lon: -9.13,
      elevationFt: 374,
      kind: 'large',
    },
    {
      icao: 'LPCS',
      iata: null,
      name: 'Cascais Airport',
      city: 'Lisbon',
      country: 'PT',
      lat: 38.72,
      lon: -9.35,
      elevationFt: 325,
      kind: 'medium',
    },
    {
      icao: 'LPPR',
      iata: 'OPO',
      name: 'Francisco Sá Carneiro Airport',
      city: 'Porto',
      country: 'PT',
      lat: 41.24,
      lon: -8.68,
      elevationFt: 228,
      kind: 'large',
    },
    {
      icao: 'XXXX',
      iata: 'LIS',
      name: 'Tiny Lis Strip',
      city: null,
      country: 'PT',
      lat: 0,
      lon: 0,
      elevationFt: null,
      kind: 'small',
    },
  ],
  airlines: [
    {
      icao: 'TAP',
      iata: 'TP',
      name: 'TAP Air Portugal',
      callsign: 'AIR PORTUGAL',
      country: 'Portugal',
    },
  ],
  types: [{ code: 'A20N', name: 'AIRBUS A-320neo', desc: 'L2J', wtc: 'M' }],
};

describe('StaticIndex', () => {
  const idx = new StaticIndex(data);

  it('looks up airports by ICAO or IATA, preferring the bigger field', () => {
    expect(idx.airport('lppt')?.name).toBe('Humberto Delgado Airport');
    expect(idx.airport('LIS')?.icao).toBe('LPPT');
    expect(idx.airport('ZZZZ')).toBeNull();
    expect(idx.airport('ZZZ')).toBeNull();
  });

  it('resolves airlines from callsigns and aircraft types', () => {
    expect(idx.airlineOfCallsign('TAP1234')?.name).toBe('TAP Air Portugal');
    expect(idx.airlineOfCallsign('N12345')).toBeNull();
    expect(idx.airlineOfCallsign(null)).toBeNull();
    expect(idx.airline('xyz')).toBeNull();
    expect(idx.aircraftType('a20n')?.desc).toBe('L2J');
    expect(idx.aircraftType(null)).toBeNull();
  });

  it('searches airports by code, name and city', () => {
    expect(idx.searchAirports('LIS', 5)[0]?.airport.icao).toBe('LPPT');
    expect(idx.searchAirports('lisbon', 5).map((h) => h.airport.icao)).toEqual(['LPPT', 'LPCS']);
    expect(idx.searchAirports('carneiro', 5)[0]?.airport.icao).toBe('LPPR');
    expect(idx.searchAirports('sa carn', 5)[0]?.airport.icao).toBe('LPPR');
    expect(idx.searchAirports('arneir', 5)[0]?.airport.icao).toBe('LPPR');
    expect(idx.searchAirports('x', 5)).toEqual([]);
  });
});
