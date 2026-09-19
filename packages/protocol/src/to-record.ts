import type { Aircraft } from '@skytrace/adsb-types';
import type { AircraftRecord } from './aircraft-record.js';
import { hexToId } from './hex-id.js';
import { STALE_AGE } from './layout.js';

/**
 * Projects a full {@link Aircraft} onto the wire record.
 *
 * @param frameTimeMs timestamp the frame will carry; `age` is relative to it.
 */
export function toRecord(ac: Aircraft, frameTimeMs: number): AircraftRecord {
  const { icao, nonIcao } = hexToId(ac.hex);
  const ageSec = Math.round((frameTimeMs - ac.posTime) / 1000);
  return {
    icao,
    nonIcao,
    lat: ac.lat,
    lon: ac.lon,
    alt: ac.altBaro ?? ac.altGeom,
    gs: ac.gs,
    track: ac.track,
    baroRate: ac.baroRate,
    squawk: ac.squawk,
    onGround: ac.onGround,
    mlat: ac.mlat,
    tisb: ac.tisb,
    military: ac.military,
    special: ac.ladd || ac.pia,
    emergency: ac.emergency,
    category: ac.category,
    age: Math.min(STALE_AGE, Math.max(0, ageSec)),
  };
}
