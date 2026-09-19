import { describe, expect, it } from 'vitest';
import { computeLiveStats } from '../src/api/live-stats.js';
import { searchAircraft } from '../src/api/search.js';
import { makeAircraft, T0 } from './fixtures.js';

const list = [
  makeAircraft({
    hex: '4951ab',
    callsign: 'TAP1234',
    registration: 'CS-TJF',
    typeCode: 'A20N',
    altBaro: 36000,
  }),
  makeAircraft({
    hex: '4951ac',
    callsign: 'TAP12',
    registration: 'CS-TJG',
    typeCode: 'A20N',
    altBaro: 12000,
  }),
  makeAircraft({
    hex: '3c6444',
    callsign: 'DLH9LF',
    registration: 'D-AIZZ',
    typeCode: 'A320',
    onGround: true,
    altBaro: 0,
  }),
  makeAircraft({
    hex: 'ae1234',
    callsign: 'RCH123',
    registration: null,
    typeCode: null,
    military: true,
    emergency: 'general',
    squawk: '7700',
  }),
  makeAircraft({
    hex: '~abcdef',
    callsign: null,
    registration: null,
    typeCode: null,
    altBaro: null,
  }),
];

describe('searchAircraft', () => {
  it('ranks exact matches above prefix matches', () => {
    expect(searchAircraft(list, 'tap12', 10).map((h) => h.callsign)).toEqual(['TAP12', 'TAP1234']);
  });
  it('matches registrations without dashes and hex', () => {
    expect(searchAircraft(list, 'CSTJF', 10)[0]?.hex).toBe('4951ab');
    expect(searchAircraft(list, '3c64', 10)[0]?.hex).toBe('3c6444');
    expect(searchAircraft(list, 'abcdef', 10)[0]?.hex).toBe('~abcdef');
  });
  it('ignores too-short queries and respects the limit', () => {
    expect(searchAircraft(list, 'T', 10)).toEqual([]);
    expect(searchAircraft(list, 'TAP', 1)).toHaveLength(1);
    expect(searchAircraft(list, 'zzz', 10)).toEqual([]);
  });
});

describe('computeLiveStats', () => {
  it('aggregates the dashboard numbers', () => {
    const s = computeLiveStats(list, T0);
    expect(s).toMatchObject({ total: 5, airborne: 4, onGround: 1, military: 1, generatedAt: T0 });
    expect(s.emergencies).toEqual([
      { hex: 'ae1234', callsign: 'RCH123', squawk: '7700', kind: 'general' },
    ]);
    expect(s.topOperators[0]).toEqual(['TAP', 2]);
    expect(s.topTypes[0]).toEqual(['A20N', 2]);
    expect(s.altitudeBands.find(([b]) => b === 35000)?.[1]).toBe(1);
    expect(s.altitudeBands.find(([b]) => b === 10000)?.[1]).toBe(2);
  });
});
