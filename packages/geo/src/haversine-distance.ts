import { toRad } from './angles.js';
import { EARTH_RADIUS_M } from './constants.js';

/**
 * Great-circle distance between two points using the haversine formula.
 *
 * @see https://www.movable-type.co.uk/scripts/latlong.html#distance
 * @returns distance in metres
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = φ2 - φ1;
  const Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}
