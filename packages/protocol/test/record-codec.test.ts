import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  decodeCategory,
  decodeFrame,
  decodeSquawk,
  encodeAircraftFrame,
  encodeCategory,
  encodeRecord,
  encodeSquawk,
  FrameType,
  HEADER_SIZE,
  readRecord,
  RECORD_SIZE,
  type AircraftRecord,
} from '../src/index.js';
import { record } from './arbitraries.js';

function roundTrip(r: AircraftRecord): AircraftRecord {
  return readRecord(new DataView(encodeRecord(r).buffer), 0);
}

describe('record codec', () => {
  it('is exactly 28 bytes (SPEC § 4.2)', () => {
    expect(RECORD_SIZE).toBe(28);
    expect(HEADER_SIZE).toBe(7);
  });

  it('round-trips within the wire precision', () => {
    fc.assert(
      fc.property(record, (r) => {
        const d = roundTrip(r);
        expect(d.icao).toBe(r.icao);
        expect(d.nonIcao).toBe(r.nonIcao);
        expect(Math.abs(d.lat - r.lat)).toBeLessThanOrEqual(5e-7 + 1e-12);
        expect(Math.abs(d.lon - r.lon)).toBeLessThanOrEqual(5e-7 + 1e-12);
        if (r.alt === null) expect(d.alt).toBeNull();
        else expect(Math.abs((d.alt ?? NaN) - r.alt)).toBeLessThanOrEqual(12.5);
        if (r.gs === null) expect(d.gs).toBeNull();
        else expect(Math.abs((d.gs ?? NaN) - r.gs)).toBeLessThanOrEqual(0.05 + 1e-9);
        if (r.track === null) expect(d.track).toBeNull();
        else expect(Math.abs((d.track ?? NaN) - r.track)).toBeLessThanOrEqual(0.005 + 1e-9);
        if (r.baroRate === null) expect(d.baroRate).toBeNull();
        else expect(Math.abs((d.baroRate ?? NaN) - r.baroRate)).toBeLessThanOrEqual(4);
        expect(d.squawk).toBe(r.squawk);
        expect(d.category).toBe(r.category);
        expect(d.emergency).toBe(r.emergency);
        expect(d.age).toBe(r.age);
        for (const k of ['onGround', 'mlat', 'tisb', 'military', 'special'] as const) {
          expect(d[k]).toBe(r[k]);
        }
      }),
    );
  });

  it('is idempotent after the first quantization', () => {
    fc.assert(
      fc.property(record, (r) => {
        const once = encodeRecord(r);
        const twice = encodeRecord(roundTrip(r));
        expect(twice).toEqual(once);
      }),
    );
  });

  it('saturates an impossible position instead of wrapping the hemisphere', () => {
    const r = roundTrip({
      icao: 1,
      nonIcao: false,
      lat: 2500,
      lon: -4000,
      alt: 1000,
      gs: 100,
      track: 0,
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
    });
    expect(r.lat).toBe(90);
    expect(r.lon).toBe(-180);
  });

  it('saturates out-of-range values instead of wrapping', () => {
    const base = roundTrip({
      icao: 1,
      nonIcao: false,
      lat: 0,
      lon: 0,
      alt: 10_000_000,
      gs: 99_999,
      track: 359.999,
      baroRate: -10_000_000,
      squawk: '9999',
      onGround: false,
      mlat: false,
      tisb: false,
      military: false,
      special: false,
      emergency: 'none',
      category: 'Z9',
      age: 1000,
    });
    expect(base.alt).toBe(32767 * 25);
    expect(base.gs).toBe(6553.4);
    expect(base.track).toBe(0);
    expect(base.baroRate).toBe(-32767 * 8);
    expect(base.squawk).toBeNull();
    expect(base.category).toBeNull();
    expect(base.age).toBe(255);
  });

  it('encodes squawks as BCD and categories as nibbles', () => {
    expect(encodeSquawk('7700')).toBe(0x7700);
    expect(decodeSquawk(0x7700)).toBe('7700');
    expect(decodeSquawk(0x0012)).toBe('0012');
    expect(encodeSquawk(null)).toBe(0xffff);
    expect(encodeCategory('A3')).toBe(0x03);
    expect(encodeCategory('C1')).toBe(0x21);
    expect(decodeCategory(0x21)).toBe('C1');
  });

  it('sizes frames as 7 + 28·n bytes', () => {
    fc.assert(
      fc.property(
        fc.array(record, { maxLength: 50 }),
        fc.integer({ min: 0, max: 0xffffffff }),
        (rs, ts) => {
          const buf = encodeAircraftFrame(FrameType.Delta, ts, rs);
          expect(buf.byteLength).toBe(7 + 28 * rs.length);
          const f = decodeFrame(buf);
          expect(f.type).toBe(FrameType.Delta);
          expect(f.timestamp).toBe(ts);
          expect(
            f.type !== FrameType.Removals && f.type !== FrameType.Clusters && f.records,
          ).toHaveLength(rs.length);
        },
      ),
    );
  });
});
