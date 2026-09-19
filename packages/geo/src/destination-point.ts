import { normalizeLon, toDeg, toRad } from './angles.js';
import { EARTH_RADIUS_M } from './constants.js';

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

/**
 * Point reached by travelling `distanceM` along a great circle from
 * (`lat`, `lon`) with initial bearing `bearingDeg`.
 *
 * φ2 = asin(sin φ1 ⋅ cos δ + cos φ1 ⋅ sin δ ⋅ cos θ)
 * λ2 = λ1 + atan2(sin θ ⋅ sin δ ⋅ cos φ1, cos δ − sin φ1 ⋅ sin φ2)
 *
 * @see https://www.movable-type.co.uk/scripts/latlong.html#dest-point
 */
export function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceM: number,
): LatLon {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const sinφ2 = Math.min(1, Math.max(-1, sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ)));
  const φ2 = Math.asin(sinφ2);
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * sinδ * cosφ1, cosδ - sinφ1 * sinφ2);
  return { lat: toDeg(φ2), lon: normalizeLon(toDeg(λ2)) };
}
