import type { FilterSpec } from '@skytrace/adsb-types';

export interface FilterPreset {
  readonly name: string;
  readonly filter: FilterSpec;
}

const isRange = (v: unknown): v is [number, number] =>
  Array.isArray(v) &&
  v.length === 2 &&
  v.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
  (v[0] as number) <= (v[1] as number);
const isCodes = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 50 && v.every((c) => typeof c === 'string' && c.length <= 4);
const isFlag = (v: unknown): boolean => v === undefined || typeof v === 'boolean';
const FILTER_KEYS = new Set([
  'altitude',
  'speed',
  'types',
  'operators',
  'countries',
  'militaryOnly',
  'emergencyOnly',
  'laddOnly',
]);

/**
 * Hand-rolled guard for stored filters: the client avoids shipping Zod in the
 * initial bundle for one localStorage key. Mirrors `FilterSpecSchema`.
 */
export function isFilterSpec(v: unknown): v is FilterSpec {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const f = v as Record<string, unknown>;
  if (Object.keys(f).some((k) => !FILTER_KEYS.has(k))) return false;
  return (
    (f['altitude'] === undefined || isRange(f['altitude'])) &&
    (f['speed'] === undefined || isRange(f['speed'])) &&
    (f['types'] === undefined || isCodes(f['types'])) &&
    (f['operators'] === undefined || isCodes(f['operators'])) &&
    (f['countries'] === undefined || isCodes(f['countries'])) &&
    isFlag(f['militaryOnly']) &&
    isFlag(f['emergencyOnly']) &&
    isFlag(f['laddOnly'])
  );
}

function isPreset(v: unknown): v is FilterPreset {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  const name = p['name'];
  return (
    typeof name === 'string' && name.length >= 1 && name.length <= 40 && isFilterSpec(p['filter'])
  );
}

const KEY = 'skytrace.filter-presets';

/** Presets persisted in localStorage (SPEC phase 4). Corrupt data resets to empty. */
export function loadPresets(storage: Pick<Storage, 'getItem'> = localStorage): FilterPreset[] {
  try {
    const raw: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) && raw.length <= 20 && raw.every(isPreset) ? raw : [];
  } catch {
    return [];
  }
}

export function savePresets(
  presets: readonly FilterPreset[],
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(KEY, JSON.stringify(presets.slice(0, 20)));
  } catch {
    // Quota or private mode: presets live for this session only.
  }
}

/** Number of active criteria, for the "Filters · 2" chip. */
export function activeCriteria(f: FilterSpec): number {
  let n = 0;
  if (f.altitude !== undefined) n++;
  if (f.speed !== undefined) n++;
  if ((f.types?.length ?? 0) > 0) n++;
  if ((f.operators?.length ?? 0) > 0) n++;
  if ((f.countries?.length ?? 0) > 0) n++;
  if (f.militaryOnly === true) n++;
  if (f.emergencyOnly === true) n++;
  if (f.laddOnly === true) n++;
  return n;
}
