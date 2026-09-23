import type { Aircraft } from '@skytrace/adsb-types';
import { bboxAroundPoint, lookAngles, METERS_PER_NM, type LookAngles } from '@skytrace/geo';
import type { SpatialIndex } from '../state/spatial-index.js';

export interface OverheadAircraft {
  readonly hex: string;
  readonly callsign: string | null;
  readonly registration: string | null;
  readonly typeCode: string | null;
  readonly altitude: number | null;
  readonly gs: number | null;
  readonly track: number | null;
  readonly lat: number;
  readonly lon: number;
  readonly azimuth: number;
  readonly elevation: number;
  readonly slantRangeNm: number;
  readonly groundRangeNm: number;
}

/** Nothing further than this can plausibly be "above me". */
export const OVERHEAD_RADIUS_NM = 80;

const round = (v: number, digits = 1): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

function entry(ac: Aircraft, angles: LookAngles): OverheadAircraft {
  return {
    hex: ac.hex,
    callsign: ac.callsign,
    registration: ac.registration,
    typeCode: ac.typeCode,
    altitude: ac.onGround ? 0 : ac.altBaro,
    gs: ac.gs,
    track: ac.track,
    lat: ac.lat,
    lon: ac.lon,
    azimuth: round(angles.azimuth),
    elevation: round(angles.elevation),
    slantRangeNm: round(angles.slantRangeM / METERS_PER_NM),
    groundRangeNm: round(angles.groundRangeM / METERS_PER_NM),
  };
}

/**
 * Aircraft visible from a point on the ground, highest in the sky first
 * (SPEC phase 8, "what's above me"). Airborne only: an aircraft on the
 * ground a mile away is not something you can look up at.
 */
export function overhead(
  index: SpatialIndex,
  lat: number,
  lon: number,
  limit: number,
  radiusNm = OVERHEAD_RADIUS_NM,
  observerElevationFt = 0,
): OverheadAircraft[] {
  const out: OverheadAircraft[] = [];
  for (const { ac } of index.query(bboxAroundPoint(lat, lon, radiusNm * METERS_PER_NM))) {
    if (ac.onGround || ac.altBaro === null) continue;
    const angles = lookAngles(lat, lon, ac.lat, ac.lon, ac.altBaro, observerElevationFt);
    if (angles.elevation <= 0 || angles.groundRangeM > radiusNm * METERS_PER_NM) continue;
    out.push(entry(ac, angles));
  }
  return out.sort((a, b) => b.elevation - a.elevation).slice(0, limit);
}
