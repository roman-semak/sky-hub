import { decodeFrame, FrameType, idToHex, type Frame } from '@skytrace/protocol';
import { describe, expect, it } from 'vitest';
import { ClientSession } from '../src/stream/client-session.js';
import { TOP_N, zoomPolicy } from '../src/stream/zoom-policy.js';
import { World } from './world.js';

const LISBON: [number, number, number, number] = [-11, 37, -8, 40];

function frames(session: ClientSession, view: ReturnType<World['rebuild']>): Frame[] {
  const p = session.buildFrames(view);
  p.commit();
  return p.frames.map((f) => decodeFrame(f));
}

const hexes = (f: Frame | undefined): string[] =>
  f !== undefined && (f.type === FrameType.Snapshot || f.type === FrameType.Delta)
    ? f.records.map((r) => idToHex(r.icao, r.nonIcao)).sort()
    : [];

describe('zoomPolicy', () => {
  it('follows the SPEC table', () => {
    expect(zoomPolicy(9)).toEqual({ mode: 'all', intervalMs: 1000 });
    expect(zoomPolicy(8)).toEqual({ mode: 'all', intervalMs: 1000 });
    expect(zoomPolicy(7)).toEqual({ mode: 'all', intervalMs: 2000 });
    expect(zoomPolicy(6)).toEqual({ mode: 'all', intervalMs: 2000 });
    expect(zoomPolicy(5)).toEqual({ mode: 'top', intervalMs: 3000 });
    expect(zoomPolicy(4)).toEqual({ mode: 'top', intervalMs: 3000 });
    expect(zoomPolicy(3)).toEqual({ mode: 'clusters', intervalMs: 5000 });
  });
});

describe('ClientSession', () => {
  it('sends nothing before subscribing', () => {
    const w = new World().put({ hex: '000001' });
    const s = new ClientSession();
    expect(s.isDue(w.now)).toBe(false);
    expect(s.buildFrames(w.rebuild()).frames).toHaveLength(0);
  });

  it('sends a snapshot first, then only changes and removals', () => {
    const w = new World().put(
      { hex: '000001' },
      { hex: '000002', lat: 39 },
      { hex: '000003', lat: 60 },
    );
    const s = new ClientSession();
    s.subscribe({ bbox: LISBON, zoom: 9 });
    const [snap] = frames(s, w.rebuild());
    expect(snap?.type).toBe(FrameType.Snapshot);
    expect(hexes(snap)).toEqual(['000001', '000002']);
    expect(s.inView).toBe(2);

    // Nothing changed → nothing on the wire.
    expect(frames(s, w.rebuild())).toEqual([]);

    // 000001 moves, 000002 leaves the viewport.
    w.now += 1000;
    w.put({ hex: '000001', lat: 38.8 }, { hex: '000002', lat: 55 });
    const next = frames(s, w.rebuild());
    expect(next[0]?.type).toBe(FrameType.Removals);
    expect(
      next[0]?.type === FrameType.Removals &&
        next[0].removals.map((r) => idToHex(r.icao, r.nonIcao)),
    ).toEqual(['000002']);
    expect(next[1]?.type).toBe(FrameType.Delta);
    expect(hexes(next[1])).toEqual(['000001']);
  });

  it('removes an evicted aircraft the client had been sent', () => {
    const w = new World().put({ hex: '000001' });
    const s = new ClientSession();
    s.subscribe({ bbox: LISBON, zoom: 9 });
    frames(s, w.rebuild());
    w.store.evictStale(w.now + 1_000_000, 1);
    const out = frames(s, w.rebuild());
    expect(out[0]?.type === FrameType.Removals && out[0].removals).toHaveLength(1);
  });

  it('does not advance state when frames are not committed', () => {
    const w = new World().put({ hex: '000001' });
    const s = new ClientSession();
    s.subscribe({ bbox: LISBON, zoom: 9 });
    s.buildFrames(w.rebuild());
    const again = frames(s, w.rebuild());
    expect(again[0]?.type).toBe(FrameType.Snapshot);
  });

  it('paces frames by zoom interval and answers new subscriptions immediately', () => {
    const w = new World().put({ hex: '000001' });
    const s = new ClientSession();
    s.subscribe({ bbox: LISBON, zoom: 6 });
    expect(s.isDue(w.now)).toBe(true);
    frames(s, w.rebuild());
    expect(s.isDue(w.now + 1000)).toBe(false);
    expect(s.isDue(w.now + 2000)).toBe(true);
    s.subscribe({ bbox: LISBON, zoom: 6 });
    expect(s.isDue(w.now + 1)).toBe(true);
  });

  it('applies filters', () => {
    const w = new World().put({ hex: '000001', military: true }, { hex: '000002' });
    const s = new ClientSession();
    s.subscribe({ bbox: LISBON, zoom: 9 });
    s.setFilter({ militaryOnly: true });
    expect(hexes(frames(s, w.rebuild())[0])).toEqual(['000001']);
  });

  it('filters by registration country via the resolver', () => {
    const w = new World().put({ hex: '4951ab' }, { hex: '3c6444' });
    const s = new ClientSession((hex) => (hex.startsWith('49') ? 'PT' : 'DE'));
    s.subscribe({ bbox: LISBON, zoom: 9 });
    s.setFilter({ countries: ['PT'] });
    expect(hexes(frames(s, w.rebuild())[0])).toEqual(['4951ab']);
  });

  it('counts what a filter would show without applying it', () => {
    const w = new World().put(
      { hex: '000001', altBaro: 30000 },
      { hex: '000002', altBaro: 5000 },
      { hex: '000003', lat: 60 },
    );
    const s = new ClientSession();
    const view = w.rebuild();
    expect(s.countMatching(view, {})).toBe(0);
    s.subscribe({ bbox: LISBON, zoom: 9 });
    expect(s.countMatching(view, {})).toBe(2);
    expect(s.countMatching(view, { altitude: [20000, 45000] })).toBe(1);
  });

  it('streams watched aircraft even outside the viewport, capped at 20', () => {
    const w = new World().put({ hex: '000001' }, { hex: '0000ff', lat: -30, lon: 100 });
    const s = new ClientSession();
    s.subscribe({ bbox: LISBON, zoom: 9 });
    expect(s.watch('0000ff')).toBe(true);
    expect(hexes(frames(s, w.rebuild())[0])).toEqual(['000001', '0000ff']);
    s.unwatch('0000ff');
    for (let i = 0; i < 20; i++) s.watch(`1000${i.toString().padStart(2, '0')}`);
    expect(s.watch('999999')).toBe(false);
  });

  it('sends top-N by altitude plus emergencies and military at zoom 4–5', () => {
    const w = new World().put(...World.grid(TOP_N + 50));
    w.put(
      { hex: 'e00001', altBaro: 100, emergency: 'general' },
      { hex: 'e00002', altBaro: 50, military: true },
    );
    const s = new ClientSession();
    s.subscribe({ bbox: LISBON, zoom: 5 });
    const [snap] = frames(s, w.rebuild());
    const got = hexes(snap);
    expect(got).toHaveLength(TOP_N + 2);
    expect(got).toContain('e00001');
    expect(got).toContain('e00002');
    // The lowest regular aircraft (a00000 at 1000 ft) is dropped.
    expect(got).not.toContain('a00000');
  });

  it('sends clusters plus emergencies at zoom ≤ 3 and clears them when zooming in', () => {
    const w = new World().put(...World.grid(100));
    w.put({ hex: 'e00001', emergency: 'unlawful' });
    const s = new ClientSession();
    s.subscribe({ bbox: [-180, -85, 180, 85], zoom: 2 });
    const out = frames(s, w.rebuild());
    expect(hexes(out.find((f) => f.type === FrameType.Snapshot))).toEqual(['e00001']);
    const clusters = out.find((f) => f.type === FrameType.Clusters);
    const total =
      clusters?.type === FrameType.Clusters
        ? clusters.clusters.reduce((a, c) => a + c.count, 0)
        : 0;
    expect(total).toBe(101);

    s.subscribe({ bbox: LISBON, zoom: 9 });
    const zoomed = frames(s, w.rebuild());
    const cleared = zoomed.find((f) => f.type === FrameType.Clusters);
    expect(cleared?.type === FrameType.Clusters && cleared.clusters).toEqual([]);
    expect(frames(s, w.rebuild()).some((f) => f.type === FrameType.Clusters)).toBe(false);
  });
});
