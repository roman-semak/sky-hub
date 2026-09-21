import type { Aircraft } from '@skytrace/adsb-types';
import { hexToId, idToHex } from '@skytrace/protocol';

/** One stored fix: SPEC § 6.1 schema `(ts, icao24, lat, lon, alt, gs, track, vr)`. */
export interface HistoryFix {
  readonly ts: number;
  readonly hex: string;
  readonly lat: number;
  readonly lon: number;
  readonly alt: number | null;
  readonly gs: number | null;
  readonly track: number | null;
  readonly vr: number | null;
}

/** Non-ICAO (`~`) addresses live above the 24-bit range so one INT32 column holds both. */
const NON_ICAO_BIT = 0x1000000;

export function icaoKey(hex: string): number {
  const { icao, nonIcao } = hexToId(hex);
  return nonIcao ? icao | NON_ICAO_BIT : icao;
}

export function hexOfKey(key: number): string {
  return idToHex(key & 0xffffff, (key & NON_ICAO_BIT) !== 0);
}

export function fixOf(ac: Aircraft): HistoryFix {
  return {
    ts: ac.posTime,
    hex: ac.hex,
    lat: ac.lat,
    lon: ac.lon,
    alt: ac.onGround ? 0 : ac.altBaro,
    gs: ac.gs,
    track: ac.track,
    vr: ac.baroRate,
  };
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'bigint' ? Number(v) : null;

/**
 * Converts a row decoded by hyparquet (untyped) into a {@link HistoryFix};
 * `null` for rows that do not match the schema.
 */
export function fixFromRow(row: Readonly<Record<string, unknown>>): HistoryFix | null {
  const ts = num(row['ts']);
  const key = num(row['icao24']);
  const lat = num(row['lat']);
  const lon = num(row['lon']);
  if (ts === null || key === null || lat === null || lon === null) return null;
  return {
    ts,
    hex: hexOfKey(key),
    lat,
    lon,
    alt: num(row['alt']),
    gs: num(row['gs']),
    track: num(row['track']),
    vr: num(row['vr']),
  };
}
