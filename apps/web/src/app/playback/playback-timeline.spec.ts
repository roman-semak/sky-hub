import { encodeAircraftFrame, FrameType, type AircraftRecord } from '@skytrace/protocol';
import { describe, expect, it } from 'vitest';
import { LiveRegistry } from '../core/live/live-registry';
import { parsePlaybackPayload, PlaybackTimeline } from './playback-timeline';

const T0 = 1_790_000_000_000;

const rec = (icao: number, lat: number): AircraftRecord => ({
  icao,
  nonIcao: false,
  lat,
  lon: -9,
  alt: 30000,
  gs: 400,
  track: 0,
  baroRate: 0,
  squawk: null,
  onGround: false,
  mlat: false,
  tisb: false,
  military: false,
  special: false,
  emergency: 'none',
  category: 'A3',
  age: 0,
});

function payload(frames: { ts: number; records: AircraftRecord[] }[]): ArrayBuffer {
  const parts = frames.map(
    (f) => new Uint8Array(encodeAircraftFrame(FrameType.Delta, f.ts / 1000, f.records)),
  );
  const out = new Uint8Array(parts.reduce((n, p) => n + 4 + p.byteLength, 0));
  const view = new DataView(out.buffer);
  let o = 0;
  for (const p of parts) {
    view.setUint32(o, p.byteLength);
    out.set(p, o + 4);
    o += 4 + p.byteLength;
  }
  return out.buffer;
}

const frames = [
  { ts: T0, records: [rec(1, 38), rec(2, 40)] },
  { ts: T0 + 20_000, records: [rec(1, 38.1)] },
  { ts: T0 + 40_000, records: [rec(1, 38.2), rec(2, 40.1)] },
];

describe('parsePlaybackPayload', () => {
  it('splits length-prefixed frames', () => {
    const parsed = parsePlaybackPayload(payload(frames));
    expect(parsed.map((f) => f.ts)).toEqual([T0, T0 + 20_000, T0 + 40_000]);
    expect(parsed[0]?.records).toHaveLength(2);
  });

  it('stops at truncated or corrupt data', () => {
    const buf = payload(frames);
    expect(parsePlaybackPayload(buf.slice(0, buf.byteLength - 3))).toHaveLength(2);
    const bad = new Uint8Array(buf.slice(0));
    bad[4] = 0x09;
    expect(parsePlaybackPayload(bad.buffer)).toHaveLength(0);
    expect(parsePlaybackPayload(new ArrayBuffer(0))).toEqual([]);
  });
});

describe('PlaybackTimeline', () => {
  it('knows its span and counts', () => {
    const tl = new PlaybackTimeline(frames);
    expect([tl.start, tl.end, tl.fixCount, tl.aircraftCount]).toEqual([T0, T0 + 40_000, 5, 2]);
    expect(new PlaybackTimeline([]).start).toBe(0);
  });

  it('applies fixes as virtual time advances', () => {
    const tl = new PlaybackTimeline(frames);
    const reg = new LiveRegistry();
    tl.advanceTo(reg, T0);
    expect(reg.aircraft.size).toBe(2);
    expect(reg.aircraft.get('000001')?.record.lat).toBe(38);
    tl.advanceTo(reg, T0 + 25_000);
    expect(reg.aircraft.get('000001')?.record.lat).toBeCloseTo(38.1, 6);
    expect(reg.aircraft.get('000001')?.fixTime).toBe(T0 + 20_000);
    tl.advanceTo(reg, T0 + 40_000);
    expect(reg.aircraft.get('000002')?.record.lat).toBeCloseTo(40.1, 6);
  });

  it('rebuilds state when seeking backwards', () => {
    const tl = new PlaybackTimeline(frames);
    const reg = new LiveRegistry();
    tl.advanceTo(reg, T0 + 40_000);
    tl.advanceTo(reg, T0 + 10_000);
    expect(reg.aircraft.get('000001')?.record.lat).toBe(38);
    // Moving forward again continues from the seek point.
    tl.advanceTo(reg, T0 + 20_000);
    expect(reg.aircraft.get('000001')?.record.lat).toBeCloseTo(38.1, 6);
  });

  it('drops aircraft not seen for two minutes of virtual time', () => {
    const tl = new PlaybackTimeline(frames);
    const reg = new LiveRegistry();
    tl.advanceTo(reg, T0 + 40_000);
    tl.advanceTo(reg, T0 + 40_000 + 125_000);
    expect(reg.aircraft.size).toBe(0);
  });

  it('seeks before the first fix to an empty map', () => {
    const tl = new PlaybackTimeline(frames);
    const reg = new LiveRegistry();
    tl.seek(reg, T0 - 1000);
    expect(reg.aircraft.size).toBe(0);
  });
});
