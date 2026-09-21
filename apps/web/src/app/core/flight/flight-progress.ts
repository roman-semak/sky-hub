import { haversineDistance, KNOTS_TO_MPS } from '@skytrace/geo';
import type { FlightRoute } from '../api/api-types';

export interface FlightProgress {
  /** Share of the great-circle route flown, `[0, 1]`. */
  readonly fraction: number;
  readonly flownKm: number;
  readonly remainingKm: number;
  /** At the current ground speed; `null` when unknown or on the ground. */
  readonly etaMin: number | null;
}

/**
 * Progress along a route from the current position: remaining distance is
 * the great-circle distance to the destination, flown is the rest of the
 * origin → destination distance. Detours make `flown + remaining` exceed the
 * route length, so the fraction is normalized by their sum.
 */
export function flightProgress(
  route: FlightRoute,
  lat: number,
  lon: number,
  gsKt: number | null,
): FlightProgress {
  const { origin: o, destination: d } = route;
  const fromOrigin = haversineDistance(o.lat, o.lon, lat, lon);
  const toDest = haversineDistance(lat, lon, d.lat, d.lon);
  const total = fromOrigin + toDest;
  const fraction = total === 0 ? 1 : fromOrigin / total;
  const etaMin =
    gsKt === null || gsKt < 50 ? null : Math.round(toDest / (gsKt * KNOTS_TO_MPS) / 60);
  return {
    fraction: Math.min(1, Math.max(0, fraction)),
    flownKm: Math.round(fromOrigin / 1000),
    remainingKm: Math.round(toDest / 1000),
    etaMin,
  };
}

export type FlightPhase = 'On ground' | 'Climbing' | 'Descending' | 'Cruising' | 'En route';

/** Coarse phase from vertical rate, as shown in the Following cards. */
export function flightPhase(
  onGround: boolean,
  baroRate: number | null,
  alt: number | null,
): FlightPhase {
  if (onGround) return 'On ground';
  if (baroRate !== null && baroRate > 500) return 'Climbing';
  if (baroRate !== null && baroRate < -500) return 'Descending';
  if (alt !== null && alt > 20_000) return 'Cruising';
  return 'En route';
}
