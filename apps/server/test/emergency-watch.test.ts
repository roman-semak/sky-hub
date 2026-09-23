import { describe, expect, it } from 'vitest';
import { SpatialIndex } from '../src/state/spatial-index.js';
import { StateStore } from '../src/state/state-store.js';
import { EmergencyWatch } from '../src/stream/emergency-watch.js';
import { makeAircraft, T0 } from './fixtures.js';

function index(...aircraft: Parameters<typeof makeAircraft>[0][]): SpatialIndex {
  const store = new StateStore();
  store.upsertMany(aircraft.map((o) => makeAircraft(o)));
  return SpatialIndex.build(store.values());
}

describe('EmergencyWatch', () => {
  it('reports each emergency once, and again when the code changes', () => {
    const w = new EmergencyWatch();
    expect(w.scan(index({ hex: '000001' }), T0)).toEqual([]);

    const first = w.scan(index({ hex: '000001', emergency: 'general', squawk: '7700' }), T0);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ hex: '000001', kind: 'general', squawk: '7700', at: T0 });

    expect(
      w.scan(index({ hex: '000001', emergency: 'general', squawk: '7700' }), T0 + 5000),
    ).toEqual([]);
    const escalated = w.scan(
      index({ hex: '000001', emergency: 'unlawful', squawk: '7500' }),
      T0 + 10_000,
    );
    expect(escalated.map((a) => a.kind)).toEqual(['unlawful']);
  });

  it('lists everything currently squawking, for clients that join late', () => {
    const w = new EmergencyWatch();
    const idx = index(
      { hex: '000001', emergency: 'nordo', squawk: '7600', military: true },
      { hex: '000002' },
      { hex: '000003', emergency: 'general', squawk: '7700' },
    );
    w.scan(idx, T0);
    expect(
      w
        .current(idx)
        .map((a) => a.hex)
        .sort(),
    ).toEqual(['000001', '000003']);
    expect(w.current(idx).find((a) => a.hex === '000001')?.military).toBe(true);
  });

  it('forgets an aircraft after it stops squawking, then alerts again', () => {
    const w = new EmergencyWatch();
    w.scan(index({ hex: '000001', emergency: 'general', squawk: '7700' }), T0);
    expect(w.size).toBe(1);
    // Nothing squawking for 15 minutes: the entry ages out.
    w.scan(index({ hex: '000001' }), T0 + 16 * 60_000);
    expect(w.size).toBe(0);
    expect(
      w.scan(index({ hex: '000001', emergency: 'general', squawk: '7700' }), T0 + 17 * 60_000),
    ).toHaveLength(1);
  });
});
