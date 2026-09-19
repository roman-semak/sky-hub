import { describe, expect, it } from 'vitest';
import { StateStore } from '../src/state/state-store.js';
import { makeAircraft, T0 } from './fixtures.js';

describe('StateStore', () => {
  it('accepts clearly newer positions and bumps the revision', () => {
    const s = new StateStore();
    expect(s.upsert(makeAircraft())).toBe(true);
    const rev = s.currentRevision;
    expect(s.upsert(makeAircraft({ posTime: T0 + 5000, lat: 39 }))).toBe(true);
    expect(s.get('abcdef')?.ac.lat).toBe(39);
    expect(s.get('abcdef')?.rev).toBeGreaterThan(rev);
  });

  it('rejects older positions', () => {
    const s = new StateStore();
    s.upsert(makeAircraft({ posTime: T0 + 5000 }));
    expect(s.upsert(makeAircraft({ posTime: T0, messages: 99_999 }))).toBe(false);
  });

  it('breaks ties between simultaneous reports by message count', () => {
    const s = new StateStore();
    s.upsert(makeAircraft({ messages: 500 }));
    expect(s.upsert(makeAircraft({ posTime: T0 + 500, messages: 100 }))).toBe(false);
    expect(s.upsert(makeAircraft({ posTime: T0 + 500, messages: 900 }))).toBe(true);
  });

  it('keeps static fields a poorer provider does not know', () => {
    const s = new StateStore();
    s.upsert(makeAircraft());
    s.upsert(
      makeAircraft({
        posTime: T0 + 5000,
        registration: null,
        typeCode: null,
        category: null,
        callsign: null,
      }),
    );
    expect(s.get('abcdef')?.ac).toMatchObject({
      registration: 'CS-TJF',
      typeCode: 'A20N',
      category: 'A3',
      callsign: 'TAP123',
    });
  });

  it('tracks size, peak and evicts stale aircraft', () => {
    const s = new StateStore();
    expect(
      s.upsertMany([
        makeAircraft({ hex: 'a00001' }),
        makeAircraft({ hex: 'a00002', seenTime: T0 - 100_000 }),
      ]),
    ).toBe(2);
    expect(s.size).toBe(2);
    expect(s.evictStale(T0 + 1000, 60_000)).toEqual(['a00002']);
    expect(s.size).toBe(1);
    expect(s.peakSize).toBe(2);
    expect([...s.values()]).toHaveLength(1);
  });
});
