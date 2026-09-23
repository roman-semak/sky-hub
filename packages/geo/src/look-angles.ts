import { toDeg } from './angles.js';
import { EARTH_RADIUS_M } from './constants.js';
import { haversineDistance } from './haversine-distance.js';
import { initialBearing } from './initial-bearing.js';

export const FEET_TO_M = 0.3048;

export interface LookAngles {
  /** Compass bearing from the observer to the aircraft, degrees `[0, 360)`. */
  readonly azimuth: number;
  /** Angle above the horizon, degrees; 90° is directly overhead. */
  readonly elevation: number;
  /** Line-of-sight distance, metres. */
  readonly slantRangeM: number;
  /** Distance along the ground, metres. */
  readonly groundRangeM: number;
}

/**
 * Where to look from the ground to see an aircraft.
 *
 * Elevation accounts for Earth's curvature: over the ground distance `d` the
 * surface drops by `d² / 2R`, so the aircraft is effectively `h − d²/2R`
 * above the observer's horizon plane.
 *
 * @see https://en.wikipedia.org/wiki/Horizon#Curvature_of_the_horizon
 * @param altitudeFt barometric/geometric altitude above mean sea level
 * @param observerElevationFt height of the observer above mean sea level
 */
export function lookAngles(
  obsLat: number,
  obsLon: number,
  acLat: number,
  acLon: number,
  altitudeFt: number,
  observerElevationFt = 0,
): LookAngles {
  const ground = haversineDistance(obsLat, obsLon, acLat, acLon);
  const height =
    (altitudeFt - observerElevationFt) * FEET_TO_M - (ground * ground) / (2 * EARTH_RADIUS_M);
  return {
    azimuth: initialBearing(obsLat, obsLon, acLat, acLon),
    elevation: toDeg(Math.atan2(height, ground)),
    slantRangeM: Math.hypot(ground, height),
    groundRangeM: ground,
  };
}

const POINTS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
];

/** Compass point of a bearing, e.g. 200° → `SSW`. */
export function compassPoint(azimuth: number): string {
  const i = Math.round((((azimuth % 360) + 360) % 360) / 22.5) % 16;
  return POINTS[i] ?? 'N';
}
