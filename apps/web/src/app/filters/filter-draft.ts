import type { FilterSpec } from '@skytrace/adsb-types';

/** Editable form state of the filter panel; converted to a {@link FilterSpec} on apply. */
export interface FilterDraft {
  altitude: [number, number];
  speed: [number, number];
  operators: string[];
  types: string[];
  countries: string[];
  militaryOnly: boolean;
  emergencyOnly: boolean;
  laddOnly: boolean;
}

export const ALT_RANGE: readonly [number, number] = [0, 45_000];
export const SPEED_RANGE: readonly [number, number] = [0, 650];

export function draftFromSpec(f: FilterSpec): FilterDraft {
  return {
    altitude: f.altitude === undefined ? [...ALT_RANGE] : [f.altitude[0], f.altitude[1]],
    speed: f.speed === undefined ? [...SPEED_RANGE] : [f.speed[0], f.speed[1]],
    operators: [...(f.operators ?? [])],
    types: [...(f.types ?? [])],
    countries: [...(f.countries ?? [])],
    militaryOnly: f.militaryOnly === true,
    emergencyOnly: f.emergencyOnly === true,
    laddOnly: f.laddOnly === true,
  };
}

/** Full-range sliders and empty lists mean "no criterion", not a filter. */
export function specFromDraft(d: FilterDraft): FilterSpec {
  const full = (r: readonly [number, number], lim: readonly [number, number]): boolean =>
    r[0] <= lim[0] && r[1] >= lim[1];
  const spec: {
    -readonly [K in keyof FilterSpec]: FilterSpec[K];
  } = {};
  if (!full(d.altitude, ALT_RANGE))
    spec.altitude = [d.altitude[0], d.altitude[1] >= ALT_RANGE[1] ? 60_000 : d.altitude[1]];
  if (!full(d.speed, SPEED_RANGE))
    spec.speed = [d.speed[0], d.speed[1] >= SPEED_RANGE[1] ? 2000 : d.speed[1]];
  if (d.operators.length > 0) spec.operators = d.operators;
  if (d.types.length > 0) spec.types = d.types;
  if (d.countries.length > 0) spec.countries = d.countries;
  if (d.militaryOnly) spec.militaryOnly = true;
  if (d.emergencyOnly) spec.emergencyOnly = true;
  if (d.laddOnly) spec.laddOnly = true;
  return spec;
}

/** `FL080`-style label for altitude sliders. */
export function flightLevel(ft: number): string {
  return ft >= ALT_RANGE[1] ? 'FL450+' : `FL${String(Math.round(ft / 100)).padStart(3, '0')}`;
}

/** Normalizes chip input: `tap ` → `TAP`; rejects anything but A–Z/0–9 of the given length. */
export function normalizeCode(raw: string, maxLen: number): string | null {
  const v = raw.trim().toUpperCase();
  return /^[A-Z0-9]+$/.test(v) && v.length <= maxLen && v.length >= 2 ? v : null;
}
