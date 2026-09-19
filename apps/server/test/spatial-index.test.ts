import { describe, expect, it } from 'vitest';
import { SpatialIndex } from '../src/state/spatial-index.js';
import { StateStore } from '../src/state/state-store.js';
import { makeAircraft } from './fixtures.js';

describe('SpatialIndex', () => {
  const store = new StateStore();
  store.upsertMany([
    makeAircraft({ hex: '000001', lat: 38.7, lon: -9.1 }),
    makeAircraft({ hex: '000002', lat: 50, lon: 8.6 }),
    makeAircraft({ hex: '000003', lat: 0, lon: 179.5 }),
    makeAircraft({ hex: '000004', lat: 0, lon: -179.5 }),
  ]);
  const index = SpatialIndex.build(store.values());

  it('queries by bbox', () => {
    expect(index.size).toBe(4);
    expect(index.query([-10, 38, -8, 39]).map((x) => x.ac.hex)).toEqual(['000001']);
    expect(index.query([100, 60, 110, 70])).toEqual([]);
  });

  it('queries across the antimeridian', () => {
    const hexes = index.query([179, -1, -179, 1]).map((x) => x.ac.hex);
    expect(hexes.sort()).toEqual(['000003', '000004']);
  });

  it('returns nearest aircraft', () => {
    expect(index.nearest(38.8, -9, 1).map((a) => a.hex)).toEqual(['000001']);
    expect(index.all()).toHaveLength(4);
  });

  it('works when empty', () => {
    const empty = SpatialIndex.build([]);
    expect(empty.query([-180, -90, 180, 90])).toEqual([]);
    expect(empty.nearest(0, 0, 5)).toEqual([]);
  });
});
