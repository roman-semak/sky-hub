import type { Aircraft } from '@skytrace/adsb-types';
import {
  bboxAroundPoint,
  haversineDistance,
  initialBearing,
  METERS_PER_NM,
  shortestAngleDelta,
} from '@skytrace/geo';
import type { SpatialIndex } from '../state/spatial-index.js';

export type TrafficRole = 'arrival' | 'departure' | 'ground' | 'overflight';

export interface TrafficEntry {
  readonly hex: string;
  readonly callsign: string | null;
  readonly typeCode: string | null;
  readonly role: TrafficRole;
  readonly distanceNm: number;
  readonly altitude: number | null;
  readonly gs: number | null;
  readonly baroRate: number | null;
}

/** SPEC § 5.3 screen 4: traffic within 50 nm. */
export const AIRPORT_RADIUS_NM = 50;
/** Above this, level traffic is en-route rather than in the terminal area. */
const OVERFLIGHT_FT = 20_000;

/**
 * Classifies traffic around an airport by vertical rate (SPEC § 5.3):
 * descending towards the field → arrival, climbing away → departure. Level
 * aircraft below FL200 heading at the field count as arrivals.
 */
export function classify(ac: Aircraft, lat: number, lon: number, elevationFt: number): TrafficRole {
  if (ac.onGround || (ac.altBaro !== null && ac.altBaro - elevationFt < 300 && (ac.gs ?? 0) < 60))
    return 'ground';
  const vr = ac.baroRate ?? 0;
  const toField = initialBearing(ac.lat, ac.lon, lat, lon);
  const heading = ac.track ?? toField;
  const towards = Math.abs(shortestAngleDelta(heading, toField)) < 90;
  // An unknown altitude must not read as "on the deck": a level aircraft at
  // an unknown level heading at the field is an overflight, not an arrival.
  const low = ac.altBaro !== null && ac.altBaro < 10_000;
  const high = ac.altBaro !== null && ac.altBaro > 10_000;
  if (vr < -300) return towards || low ? 'arrival' : 'overflight';
  if (vr > 300) return towards && high ? 'overflight' : 'departure';
  if (ac.altBaro !== null && ac.altBaro < OVERFLIGHT_FT && towards) return 'arrival';
  return 'overflight';
}

export function airportTraffic(
  index: SpatialIndex,
  lat: number,
  lon: number,
  elevationFt: number,
  radiusNm = AIRPORT_RADIUS_NM,
): TrafficEntry[] {
  const radiusM = radiusNm * METERS_PER_NM;
  const out: TrafficEntry[] = [];
  for (const { ac } of index.query(bboxAroundPoint(lat, lon, radiusM))) {
    const d = haversineDistance(lat, lon, ac.lat, ac.lon);
    if (d > radiusM) continue;
    out.push({
      hex: ac.hex,
      callsign: ac.callsign,
      typeCode: ac.typeCode,
      role: classify(ac, lat, lon, elevationFt),
      distanceNm: Math.round((d / METERS_PER_NM) * 10) / 10,
      altitude: ac.onGround ? 0 : ac.altBaro,
      gs: ac.gs,
      baroRate: ac.baroRate,
    });
  }
  return out.sort((a, b) => a.distanceNm - b.distanceNm);
}
