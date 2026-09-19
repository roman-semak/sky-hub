import type { Aircraft } from '@skytrace/adsb-types';

export interface LiveStats {
  readonly generatedAt: number;
  readonly total: number;
  readonly airborne: number;
  readonly onGround: number;
  readonly military: number;
  readonly emergencies: readonly {
    hex: string;
    callsign: string | null;
    squawk: string | null;
    kind: string;
  }[];
  /** Airborne aircraft per 5 000 ft band, `[bandStartFt, count]`. */
  readonly altitudeBands: readonly (readonly [number, number])[];
  readonly topOperators: readonly (readonly [string, number])[];
  readonly topTypes: readonly (readonly [string, number])[];
}

const BAND_FT = 5000;
const MAX_BAND = 45_000;

function top(counts: Map<string, number>, n: number): [string, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

/** Aggregates for the live dashboard (SPEC § 5.3, screen 7). */
export function computeLiveStats(list: Iterable<Aircraft>, now: number): LiveStats {
  let total = 0;
  let airborne = 0;
  let military = 0;
  const bands = new Map<number, number>();
  for (let b = 0; b <= MAX_BAND; b += BAND_FT) bands.set(b, 0);
  const ops = new Map<string, number>();
  const types = new Map<string, number>();
  const emergencies: LiveStats['emergencies'][number][] = [];
  for (const ac of list) {
    total++;
    if (ac.military) military++;
    if (ac.emergency !== 'none') {
      emergencies.push({
        hex: ac.hex,
        callsign: ac.callsign,
        squawk: ac.squawk,
        kind: ac.emergency,
      });
    }
    if (ac.typeCode !== null) types.set(ac.typeCode, (types.get(ac.typeCode) ?? 0) + 1);
    // Airline callsigns are 3-letter ICAO designator + flight number.
    const cs = ac.callsign;
    if (cs !== null && /^[A-Z]{3}\d/.test(cs)) {
      const op = cs.slice(0, 3);
      ops.set(op, (ops.get(op) ?? 0) + 1);
    }
    if (ac.onGround) continue;
    airborne++;
    if (ac.altBaro !== null) {
      const band = Math.min(MAX_BAND, Math.max(0, Math.floor(ac.altBaro / BAND_FT) * BAND_FT));
      bands.set(band, (bands.get(band) ?? 0) + 1);
    }
  }
  return {
    generatedAt: now,
    total,
    airborne,
    onGround: total - airborne,
    military,
    emergencies,
    altitudeBands: [...bands.entries()],
    topOperators: top(ops, 10),
    topTypes: top(types, 10),
  };
}
