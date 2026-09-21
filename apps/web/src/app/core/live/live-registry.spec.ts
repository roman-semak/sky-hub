import { FrameType, type AircraftRecord, type Frame } from '@skytrace/protocol';
import { describe, expect, it } from 'vitest';
import { LiveRegistry } from './live-registry';

const T = 1_700_000_000;

function rec(icao: number, over: Partial<AircraftRecord> = {}): AircraftRecord {
  return {
    icao,
    nonIcao: false,
    lat: 38.7,
    lon: -9.1,
    alt: 30_000,
    gs: 400,
    track: 90,
    baroRate: 0,
    squawk: '1000',
    onGround: false,
    mlat: false,
    tisb: false,
    military: false,
    special: false,
    emergency: 'none',
    category: 'A3',
    age: 0,
    ...over,
  };
}

const snapshot = (records: AircraftRecord[]): Frame => ({
  type: FrameType.Snapshot,
  timestamp: T,
  records,
});
const delta = (records: AircraftRecord[], ts = T): Frame => ({
  type: FrameType.Delta,
  timestamp: ts,
  records,
});

describe('LiveRegistry', () => {
  it('replaces the whole set on a snapshot', () => {
    const r = new LiveRegistry();
    r.apply(snapshot([rec(1), rec(2)]), T * 1000);
    expect([...r.aircraft.keys()]).toEqual(['000001', '000002']);
    r.apply(snapshot([rec(2)]), T * 1000);
    expect([...r.aircraft.keys()]).toEqual(['000002']);
  });

  it('merges deltas and blends new fixes', () => {
    const r = new LiveRegistry();
    r.apply(snapshot([rec(1)]), T * 1000);
    const first = r.aircraft.get('000001');
    r.apply(delta([rec(1, { lat: 38.71 })], T + 1), (T + 1) * 1000);
    const after = r.aircraft.get('000001');
    expect(after).toBe(first);
    expect(after?.track.previous).not.toBeNull();
    expect(after?.record.lat).toBe(38.71);
  });

  it('applies removals and cluster frames', () => {
    const r = new LiveRegistry();
    r.apply(snapshot([rec(1), rec(0xabcdef, { nonIcao: true })]), T * 1000);
    r.apply(
      { type: FrameType.Removals, timestamp: T, removals: [{ icao: 1, nonIcao: false }] },
      T * 1000,
    );
    expect(r.aircraft.has('000001')).toBe(false);
    expect(r.aircraft.has('~abcdef')).toBe(true);
    r.apply(
      { type: FrameType.Clusters, timestamp: T, clusters: [{ lat: 1, lon: 2, count: 5 }] },
      T * 1000,
    );
    expect(r.clusters).toHaveLength(1);
  });

  it('bumps the version only when membership or icon changes', () => {
    const r = new LiveRegistry();
    r.apply(snapshot([rec(1)]), T * 1000);
    const v = r.version;
    r.apply(delta([rec(1, { lat: 38.72 })], T + 1), (T + 1) * 1000);
    expect(r.version).toBe(v);
    r.apply(delta([rec(1, { category: 'A7' })], T + 2), (T + 2) * 1000);
    expect(r.version).toBeGreaterThan(v);
  });

  it('derives fix time from frame timestamp, age and clock offset', () => {
    const r = new LiveRegistry();
    // Server clock runs 5 s behind the browser.
    r.syncClock(T * 1000, T * 1000 + 5000);
    r.apply(snapshot([rec(1, { age: 3 })]), T * 1000 + 5000);
    expect(r.aircraft.get('000001')?.fixTime).toBe((T - 3) * 1000 + 5000);
  });

  it('never dates a fix in the future', () => {
    const r = new LiveRegistry();
    r.apply(snapshot([rec(1)]), T * 1000 - 10_000);
    expect(r.aircraft.get('000001')?.fixTime).toBe(T * 1000 - 10_000);
  });

  it('prunes stale aircraft and clears', () => {
    const r = new LiveRegistry();
    r.apply(snapshot([rec(1)]), T * 1000);
    expect(r.prune(T * 1000 + 60_000)).toBe(0);
    expect(r.prune(T * 1000 + 121_000)).toBe(1);
    r.apply(snapshot([rec(1)]), T * 1000);
    r.clear();
    expect(r.aircraft.size).toBe(0);
  });
});
