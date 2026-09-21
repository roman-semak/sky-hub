import { haversineDistance, initialBearing, KNOTS_TO_MPS, shortestAngleDelta } from '@skytrace/geo';
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

/**
 * Whether a published route plausibly describes what the aircraft is doing.
 * Callsign → route databases sometimes return the opposite leg of a
 * rotation; the tell is an aircraft climbing out right next to its supposed
 * destination, or flying directly away from it.
 */
export function routePlausible(
  route: FlightRoute,
  lat: number,
  lon: number,
  track: number | null,
  baroRate: number | null,
  onGround: boolean,
): boolean {
  if (onGround || track === null) return true;
  const { destination: d } = route;
  const toDestM = haversineDistance(lat, lon, d.lat, d.lon);
  const away = Math.abs(shortestAngleDelta(track, initialBearing(lat, lon, d.lat, d.lon))) > 100;
  if (toDestM < 60_000 && (baroRate ?? 0) > 1000) return false;
  if (toDestM > 30_000 && away && (baroRate ?? 0) >= 0) return false;
  return true;
}

export type FlightPhase = 'ground' | 'climbing' | 'descending' | 'cruising' | 'enroute';

/** Display label of a {@link FlightPhase} in the current locale. */
export function phaseLabel(p: FlightPhase): string {
  switch (p) {
    case 'ground':
      return $localize`:@@phase.ground:On ground`;
    case 'climbing':
      return $localize`:@@phase.climbing:Climbing`;
    case 'descending':
      return $localize`:@@phase.descending:Descending`;
    case 'cruising':
      return $localize`:@@phase.cruising:Cruising`;
    case 'enroute':
      return $localize`:@@phase.enroute:En route`;
  }
}

/** Coarse phase from vertical rate, as shown in the Following cards. */
export function flightPhase(
  onGround: boolean,
  baroRate: number | null,
  alt: number | null,
): FlightPhase {
  if (onGround) return 'ground';
  if (baroRate !== null && baroRate > 500) return 'climbing';
  if (baroRate !== null && baroRate < -500) return 'descending';
  if (alt !== null && alt > 20_000) return 'cruising';
  return 'enroute';
}
