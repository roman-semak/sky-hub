import type { AdsbAircraft } from './adsb-aircraft.schema.js';
import type { Aircraft } from './aircraft.js';
import { resolveEmergency } from './emergency.js';

// readsb `dbFlags` bitfield.
const DB_FLAG_MILITARY = 1;
const DB_FLAG_PIA = 4;
const DB_FLAG_LADD = 8;

function cleanString(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Converts a validated provider aircraft into our {@link Aircraft}.
 *
 * @param raw validated provider object
 * @param nowMs provider `now` timestamp, unix ms
 * @returns `null` if the aircraft has no position (nothing to draw).
 */
export function normalizeAircraft(raw: AdsbAircraft, nowMs: number): Aircraft | null {
  if (raw.lat === undefined || raw.lon === undefined) return null;
  const onGround = raw.alt_baro === 'ground';
  const altBaro = onGround ? 0 : (raw.alt_baro ?? null);
  const flags = raw.dbFlags ?? 0;
  const seen = raw.seen ?? 0;
  const seenPos = raw.seen_pos ?? seen;
  return {
    hex: raw.hex.toLowerCase(),
    callsign: cleanString(raw.flight),
    registration: cleanString(raw.r),
    typeCode: cleanString(raw.t),
    lat: raw.lat,
    lon: raw.lon,
    altBaro: typeof altBaro === 'number' ? altBaro : null,
    altGeom: raw.alt_geom ?? null,
    onGround,
    gs: raw.gs ?? null,
    track: raw.track ?? null,
    baroRate: raw.baro_rate ?? raw.geom_rate ?? null,
    squawk: cleanString(raw.squawk),
    emergency: resolveEmergency(raw.emergency, raw.squawk),
    category: cleanString(raw.category),
    navAltitudeMcp: raw.nav_altitude_mcp ?? null,
    messages: raw.messages ?? 0,
    rssi: raw.rssi ?? null,
    mlat: (raw.mlat?.length ?? 0) > 0 || raw.type === 'mlat',
    tisb: (raw.tisb?.length ?? 0) > 0 || raw.type?.startsWith('tisb') === true,
    military: (flags & DB_FLAG_MILITARY) !== 0,
    ladd: (flags & DB_FLAG_LADD) !== 0,
    pia: (flags & DB_FLAG_PIA) !== 0,
    posTime: Math.round(nowMs - seenPos * 1000),
    seenTime: Math.round(nowMs - seen * 1000),
  };
}
