import type { Aircraft } from '@skytrace/adsb-types';

export interface SearchHit {
  readonly kind: 'aircraft';
  readonly hex: string;
  readonly callsign: string | null;
  readonly registration: string | null;
  readonly typeCode: string | null;
  readonly lat: number;
  readonly lon: number;
  /** Lower is better. */
  readonly rank: number;
}

const norm = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Searches live aircraft by callsign, registration or hex. Exact matches rank
 * above prefix matches; registrations ignore dashes (`CSTJF` finds `CS-TJF`).
 */
export function searchAircraft(
  list: Iterable<Aircraft>,
  query: string,
  limit: number,
): SearchHit[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];
  for (const ac of list) {
    const fields = [ac.callsign, ac.registration, ac.hex.replace('~', '')];
    let rank = Number.POSITIVE_INFINITY;
    for (const f of fields) {
      if (f === null) continue;
      const v = norm(f);
      if (v === q) rank = Math.min(rank, 0);
      else if (v.startsWith(q)) rank = Math.min(rank, 1 + v.length - q.length);
    }
    if (rank !== Number.POSITIVE_INFINITY) {
      hits.push({
        kind: 'aircraft',
        hex: ac.hex,
        callsign: ac.callsign,
        registration: ac.registration,
        typeCode: ac.typeCode,
        lat: ac.lat,
        lon: ac.lon,
        rank,
      });
    }
  }
  return hits
    .sort((a, b) => a.rank - b.rank || (a.callsign ?? '').localeCompare(b.callsign ?? ''))
    .slice(0, limit);
}
