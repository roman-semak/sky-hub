import { parseCsv, parseCsvObjects } from './csv.js';
import type { AircraftType, Airline, Airport } from './schemas.js';

const KINDS: Readonly<Record<string, Airport['kind']>> = {
  large_airport: 'large',
  medium_airport: 'medium',
  small_airport: 'small',
};

const ICAO_CODE = /^[A-Z]{4}$/;
const round5 = (v: number): number => Math.round(v * 1e5) / 1e5;
const blank = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' || t === '\\N' || t === '-' ? null : t;
};

/**
 * OurAirports `airports.csv` → {@link Airport}. Keeps land airports that have
 * a 4-letter ICAO-style code (heliports, seaplane bases and closed fields
 * are dropped).
 *
 * @see https://ourairports.com/help/data-dictionary.html
 */
export function normalizeAirports(csv: string): Airport[] {
  const out: Airport[] = [];
  for (const r of parseCsvObjects(csv)) {
    const kind = KINDS[r['type'] ?? ''];
    if (kind === undefined) continue;
    const candidates = [r['icao_code'], r['gps_code'], r['ident']].map((c) =>
      (c ?? '').trim().toUpperCase(),
    );
    const icao = candidates.find((c) => ICAO_CODE.test(c));
    const lat = Number(r['latitude_deg']);
    const lon = Number(r['longitude_deg']);
    const country = (r['iso_country'] ?? '').trim().toUpperCase();
    if (
      icao === undefined ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      country.length !== 2
    )
      continue;
    const iata = blank(r['iata_code'])?.toUpperCase() ?? null;
    const elev = Number(r['elevation_ft']);
    out.push({
      icao,
      iata: iata !== null && /^[A-Z0-9]{3}$/.test(iata) ? iata : null,
      name: (r['name'] ?? '').trim(),
      city: blank(r['municipality']),
      country,
      lat: round5(lat),
      lon: round5(lon),
      elevationFt: r['elevation_ft'] === '' || !Number.isFinite(elev) ? null : Math.round(elev),
      kind,
    });
  }
  // Duplicate idents exist in the raw data; keep the biggest field per code.
  const rank = { large: 0, medium: 1, small: 2 } as const;
  const byIcao = new Map<string, Airport>();
  for (const a of out) {
    const prev = byIcao.get(a.icao);
    if (prev === undefined || rank[a.kind] < rank[prev.kind]) byIcao.set(a.icao, a);
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

/**
 * OpenFlights `airlines.dat` (headerless CSV:
 * id, name, alias, IATA, ICAO, callsign, country, active) → {@link Airline}.
 *
 * @see https://openflights.org/data.php#airline
 */
export function normalizeAirlines(dat: string): Airline[] {
  const byIcao = new Map<string, { airline: Airline; active: boolean }>();
  for (const row of parseCsv(dat)) {
    const [, name, , iata, icao, callsign, country, active] = row;
    const code = (icao ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || blank(name) === null) continue;
    const iataCode = blank(iata)?.toUpperCase() ?? null;
    const entry = {
      airline: {
        icao: code,
        iata: iataCode !== null && /^[A-Z0-9]{2}$/.test(iataCode) ? iataCode : null,
        name: (name ?? '').trim(),
        callsign: blank(callsign)?.toUpperCase() ?? null,
        country: blank(country),
      },
      active: (active ?? '').trim() === 'Y',
    };
    const prev = byIcao.get(code);
    // Codes get reused after airlines fold; prefer the active operator.
    if (prev === undefined || (entry.active && !prev.active)) byIcao.set(code, entry);
  }
  return [...byIcao.values()].map((e) => e.airline).sort((a, b) => a.icao.localeCompare(b.icao));
}

/**
 * Mictronics `types.json` (`{ "A20N": [name, desc, wtc] }`) → {@link AircraftType}.
 */
export function normalizeTypes(json: unknown): AircraftType[] {
  if (typeof json !== 'object' || json === null) return [];
  const out: AircraftType[] = [];
  for (const [code, value] of Object.entries(json)) {
    if (!/^[A-Z0-9]{2,4}$/.test(code) || !Array.isArray(value)) continue;
    const [name, desc, wtc] = value as unknown[];
    if (typeof name !== 'string' || name.trim() === '') continue;
    out.push({
      code,
      name: name.trim(),
      desc: typeof desc === 'string' && desc !== '' ? desc : null,
      wtc: typeof wtc === 'string' && wtc !== '' ? wtc : null,
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}
