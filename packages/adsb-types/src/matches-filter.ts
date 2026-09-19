import type { Aircraft } from './aircraft.js';
import type { FilterSpec } from './filter-spec.js';

/** Resolves an aircraft to an ISO-3166 alpha-2 country, e.g. from its ICAO24 block. */
export type CountryResolver = (hex: string) => string | null;

function inRange(value: number | null, range: readonly [number, number] | undefined): boolean {
  if (range === undefined) return true;
  if (value === null) return false;
  return value >= range[0] && value <= range[1];
}

/**
 * Applies a {@link FilterSpec}. Every present criterion must match (AND);
 * list criteria match any of their values (OR). Shared by server and client
 * so the "Show N flights" count agrees with what the server sends.
 */
export function matchesFilter(ac: Aircraft, f: FilterSpec, countryOf?: CountryResolver): boolean {
  if (f.militaryOnly === true && !ac.military) return false;
  if (f.emergencyOnly === true && ac.emergency === 'none') return false;
  if (f.laddOnly === true && !ac.ladd) return false;
  if (!inRange(ac.onGround ? 0 : ac.altBaro, f.altitude)) return false;
  if (!inRange(ac.gs, f.speed)) return false;
  if (f.types !== undefined && f.types.length > 0) {
    if (ac.typeCode === null || !f.types.includes(ac.typeCode)) return false;
  }
  if (f.operators !== undefined && f.operators.length > 0) {
    const prefix = ac.callsign?.slice(0, 3) ?? null;
    if (prefix === null || !f.operators.includes(prefix)) return false;
  }
  if (f.countries !== undefined && f.countries.length > 0) {
    const country = countryOf?.(ac.hex) ?? null;
    if (country === null || !f.countries.includes(country)) return false;
  }
  return true;
}

export function isEmptyFilter(f: FilterSpec): boolean {
  return (
    f.militaryOnly !== true &&
    f.emergencyOnly !== true &&
    f.laddOnly !== true &&
    f.altitude === undefined &&
    f.speed === undefined &&
    (f.types?.length ?? 0) === 0 &&
    (f.operators?.length ?? 0) === 0 &&
    (f.countries?.length ?? 0) === 0
  );
}
