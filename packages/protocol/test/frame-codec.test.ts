import type { Aircraft } from '@skytrace/adsb-types';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assembleAircraftFrame,
  ClientMessageSchema,
  decodeEmergency,
  decodeFrame,
  encodeAircraftFrame,
  encodeClusters,
  encodeEmergency,
  encodeRecord,
  encodeRemovals,
  FrameType,
  hexToId,
  idToHex,
  toRecord,
} from '../src/index.js';
import { record } from './arbitraries.js';

const T = 1_700_000_000;

describe('removals and clusters', () => {
  it('round-trips removal ids', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ icao: fc.integer({ min: 0, max: 0xffffff }), nonIcao: fc.boolean() }),
          { maxLength: 100 },
        ),
        (ids) => {
          const f = decodeFrame(encodeRemovals(T, ids));
          expect(f.type === FrameType.Removals && f.removals).toEqual(ids);
        },
      ),
    );
  });

  it('round-trips clusters', () => {
    const f = decodeFrame(encodeClusters(T, [{ lat: 38.7, lon: -9.1, count: 70_000 }]));
    expect(f.type === FrameType.Clusters && f.clusters).toEqual([
      { lat: 38.7, lon: -9.1, count: 0xffff },
    ]);
  });

  it('rejects oversized frames', () => {
    expect(() => encodeRemovals(T, new Array(70_000).fill({ icao: 1, nonIcao: false }))).toThrow(
      RangeError,
    );
  });
});

describe('decodeFrame', () => {
  it('rejects malformed input', () => {
    expect(() => decodeFrame(new ArrayBuffer(3))).toThrow(/shorter/);
    const bad = new Uint8Array(7);
    bad[0] = 0x09;
    expect(() => decodeFrame(bad)).toThrow(/unknown frame type/);
    const trunc = new Uint8Array(encodeRemovals(T, [{ icao: 1, nonIcao: false }])).subarray(0, 9);
    expect(() => decodeFrame(trunc)).toThrow(/does not match/);
  });

  it('accepts typed-array views with offsets', () => {
    const buf = encodeRemovals(T, [{ icao: 0xabcdef, nonIcao: true }]);
    const padded = new Uint8Array(buf.byteLength + 4);
    padded.set(new Uint8Array(buf), 4);
    const f = decodeFrame(padded.subarray(4));
    expect(f.type === FrameType.Removals && f.removals[0]).toEqual({
      icao: 0xabcdef,
      nonIcao: true,
    });
  });
});

describe('assembleAircraftFrame', () => {
  it('matches direct encoding and patches age per frame', () => {
    fc.assert(
      fc.property(
        fc.array(record, { maxLength: 20 }),
        fc.integer({ min: 0, max: 300 }),
        (rs, dt) => {
          const posTime = T * 1000;
          const encoded = rs.map((r) => ({ bytes: encodeRecord(r), posTime }));
          const frame = decodeFrame(assembleAircraftFrame(FrameType.Snapshot, T + dt, encoded));
          if (frame.type !== FrameType.Snapshot) throw new Error('type');
          frame.records.forEach((d, i) => {
            expect(d.age).toBe(Math.min(255, dt));
            expect(d.icao).toBe(rs[i]?.icao);
          });
          const direct = encodeAircraftFrame(
            FrameType.Snapshot,
            T + dt,
            rs.map((r) => ({ ...r, age: Math.min(255, dt) })),
          );
          expect(
            new Uint8Array(assembleAircraftFrame(FrameType.Snapshot, T + dt, encoded)),
          ).toEqual(new Uint8Array(direct));
        },
      ),
    );
  });
});

describe('ids and helpers', () => {
  it('converts hex ids', () => {
    expect(hexToId('4951ab')).toEqual({ icao: 0x4951ab, nonIcao: false });
    expect(hexToId('~00000a')).toEqual({ icao: 10, nonIcao: true });
    expect(idToHex(10, true)).toBe('~00000a');
    expect(idToHex(0x4951ab, false)).toBe('4951ab');
    expect(() => hexToId('zzzzzz')).toThrow(RangeError);
    expect(() => hexToId('1000000')).toThrow(RangeError);
  });

  it('maps emergency kinds', () => {
    expect(decodeEmergency(encodeEmergency('unlawful'))).toBe('unlawful');
    expect(decodeEmergency(99)).toBe('none');
  });

  it('projects an Aircraft onto a record', () => {
    const ac: Aircraft = {
      hex: '~4951ab',
      callsign: 'TAP1',
      registration: null,
      typeCode: null,
      lat: 1,
      lon: 2,
      altBaro: null,
      altGeom: 1200,
      onGround: false,
      gs: 100,
      track: 90,
      baroRate: 0,
      squawk: '7700',
      emergency: 'general',
      category: 'A3',
      navAltitudeMcp: null,
      messages: 1,
      rssi: null,
      mlat: false,
      tisb: true,
      military: false,
      ladd: false,
      pia: true,
      posTime: T * 1000 - 3000,
      seenTime: T * 1000,
    };
    expect(toRecord(ac, T * 1000)).toMatchObject({
      icao: 0x4951ab,
      nonIcao: true,
      alt: 1200,
      age: 3,
      special: true,
    });
    expect(toRecord({ ...ac, posTime: T * 1000 + 5000 }, T * 1000).age).toBe(0);
    expect(toRecord({ ...ac, posTime: 0 }, T * 1000).age).toBe(255);
  });
});

describe('ClientMessageSchema', () => {
  it('accepts the SPEC message set', () => {
    for (const m of [
      { t: 'sub', bbox: [-10, 35, 5, 45], zoom: 6 },
      { t: 'watch', hex: '4951ab' },
      { t: 'unwatch', hex: '~4951ab' },
      { t: 'filter', f: { militaryOnly: true } },
      { t: 'pong', ts: 1 },
      { t: 'preview', f: { altitude: [20000, 45000] }, id: 3 },
    ]) {
      expect(ClientMessageSchema.safeParse(m).success).toBe(true);
    }
  });

  it('rejects garbage', () => {
    for (const m of [
      { t: 'sub', bbox: [-10, 50, 5, 45], zoom: 6 },
      { t: 'sub', bbox: [-200, 35, 5, 45], zoom: 6 },
      { t: 'watch', hex: 'XYZ' },
      { t: 'nuke' },
      'sub',
    ]) {
      expect(ClientMessageSchema.safeParse(m).success).toBe(false);
    }
  });
});
