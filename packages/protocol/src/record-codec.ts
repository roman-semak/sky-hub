import type { AircraftRecord } from './aircraft-record.js';
import { decodeCategory, encodeCategory } from './category-code.js';
import { decodeEmergency, encodeEmergency } from './emergency-code.js';
import { FLAG, NULL_I16, NULL_U16, OFF, RECORD_SIZE, STALE_AGE } from './layout.js';
import { decodeSquawk, encodeSquawk } from './squawk-bcd.js';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Writes one 28-byte record at `offset`. Out-of-range values saturate. */
export function writeRecord(view: DataView, offset: number, r: AircraftRecord): void {
  const o = offset;
  view.setUint16(o + OFF.icao, r.icao >>> 8);
  view.setUint8(o + OFF.icao + 2, r.icao & 0xff);
  // Saturating, like every other field: a bad fix should land at the pole,
  // not wrap to the opposite hemisphere.
  view.setInt32(o + OFF.lat, clamp(Math.round(r.lat * 1e6), -90_000_000, 90_000_000));
  view.setInt32(o + OFF.lon, clamp(Math.round(r.lon * 1e6), -180_000_000, 180_000_000));
  view.setInt16(
    o + OFF.alt,
    r.alt === null ? NULL_I16 : clamp(Math.round(r.alt / 25), -32767, 32767),
  );
  view.setUint16(o + OFF.gs, r.gs === null ? NULL_U16 : clamp(Math.round(r.gs * 10), 0, 65534));
  view.setUint16(
    o + OFF.track,
    r.track === null ? NULL_U16 : ((Math.round(r.track * 100) % 36000) + 36000) % 36000,
  );
  view.setInt16(
    o + OFF.baroRate,
    r.baroRate === null ? NULL_I16 : clamp(Math.round(r.baroRate / 8), -32767, 32767),
  );
  view.setUint16(o + OFF.squawk, encodeSquawk(r.squawk));
  let flags = 0;
  if (r.onGround) flags |= FLAG.ground;
  if (r.mlat) flags |= FLAG.mlat;
  if (r.tisb) flags |= FLAG.tisb;
  if (r.emergency !== 'none') flags |= FLAG.emergency;
  if (r.military) flags |= FLAG.military;
  if (r.special) flags |= FLAG.special;
  if (r.nonIcao) flags |= FLAG.nonIcao;
  view.setUint8(o + OFF.flags, flags);
  view.setUint8(o + OFF.category, encodeCategory(r.category));
  view.setUint8(o + OFF.age, clamp(Math.round(r.age), 0, STALE_AGE));
  view.setUint8(o + OFF.emergency, encodeEmergency(r.emergency));
  view.setUint8(o + OFF.emergency + 1, 0);
  view.setUint16(o + OFF.emergency + 2, 0);
}

export function readRecord(view: DataView, offset: number): AircraftRecord {
  const o = offset;
  const flags = view.getUint8(o + OFF.flags);
  const alt = view.getInt16(o + OFF.alt);
  const gs = view.getUint16(o + OFF.gs);
  const track = view.getUint16(o + OFF.track);
  const vr = view.getInt16(o + OFF.baroRate);
  return {
    icao: (view.getUint16(o + OFF.icao) << 8) | view.getUint8(o + OFF.icao + 2),
    nonIcao: (flags & FLAG.nonIcao) !== 0,
    lat: view.getInt32(o + OFF.lat) / 1e6,
    lon: view.getInt32(o + OFF.lon) / 1e6,
    alt: alt === NULL_I16 ? null : alt * 25,
    gs: gs === NULL_U16 ? null : gs / 10,
    track: track === NULL_U16 ? null : track / 100,
    baroRate: vr === NULL_I16 ? null : vr * 8,
    squawk: decodeSquawk(view.getUint16(o + OFF.squawk)),
    onGround: (flags & FLAG.ground) !== 0,
    mlat: (flags & FLAG.mlat) !== 0,
    tisb: (flags & FLAG.tisb) !== 0,
    military: (flags & FLAG.military) !== 0,
    special: (flags & FLAG.special) !== 0,
    emergency: decodeEmergency(view.getUint8(o + OFF.emergency)),
    category: decodeCategory(view.getUint8(o + OFF.category)),
    age: view.getUint8(o + OFF.age),
  };
}

/** Encodes a single record into its own 28-byte buffer (server-side cache unit). */
export function encodeRecord(r: AircraftRecord): Uint8Array {
  const bytes = new Uint8Array(RECORD_SIZE);
  writeRecord(new DataView(bytes.buffer), 0, r);
  return bytes;
}
