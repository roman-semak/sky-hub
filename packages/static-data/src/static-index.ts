import type { AircraftType, Airline, Airport, StaticDatasets } from './schemas.js';

export interface AirportHit {
  readonly airport: Airport;
  /** Lower is better. */
  readonly rank: number;
}

const KIND_RANK: Readonly<Record<Airport['kind'], number>> = { large: 0, medium: 1, small: 2 };

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** In-memory lookups over the static datasets. */
export class StaticIndex {
  private readonly byIcao = new Map<string, Airport>();
  private readonly byIata = new Map<string, Airport>();
  private readonly airlines = new Map<string, Airline>();
  private readonly types = new Map<string, AircraftType>();
  private readonly searchable: { airport: Airport; text: string }[];

  constructor(readonly data: StaticDatasets) {
    for (const a of data.airports) {
      this.byIcao.set(a.icao, a);
      // Several small fields share IATA codes in the raw data; keep the biggest.
      if (a.iata !== null) {
        const prev = this.byIata.get(a.iata);
        if (prev === undefined || KIND_RANK[a.kind] < KIND_RANK[prev.kind])
          this.byIata.set(a.iata, a);
      }
    }
    for (const al of data.airlines) this.airlines.set(al.icao, al);
    for (const t of data.types) this.types.set(t.code, t);
    this.searchable = data.airports.map((airport) => ({
      airport,
      text: fold(`${airport.name} ${airport.city ?? ''}`),
    }));
  }

  /** ICAO (`LPPT`) or IATA (`LIS`) code, case-insensitive. */
  airport(code: string): Airport | null {
    const c = code.toUpperCase();
    return this.byIcao.get(c) ?? (c.length === 3 ? (this.byIata.get(c) ?? null) : null);
  }

  airline(icao: string): Airline | null {
    return this.airlines.get(icao.toUpperCase()) ?? null;
  }

  /** Airline of an airline-style callsign (`TAP1234` → TAP Portugal). */
  airlineOfCallsign(callsign: string | null): Airline | null {
    if (callsign === null || !/^[A-Z]{3}\d/.test(callsign)) return null;
    return this.airline(callsign.slice(0, 3));
  }

  aircraftType(code: string | null): AircraftType | null {
    return code === null ? null : (this.types.get(code.toUpperCase()) ?? null);
  }

  /**
   * Airport search: exact code first, then name/city prefix, then substring;
   * bigger airports first within a tier.
   */
  searchAirports(query: string, limit: number): AirportHit[] {
    const q = fold(query.trim());
    if (q.length < 2) return [];
    const exact = this.airport(q);
    const hits: AirportHit[] = exact === null ? [] : [{ airport: exact, rank: 0 }];
    for (const { airport, text } of this.searchable) {
      if (airport === exact) continue;
      const words = text.split(/\s+/);
      let rank: number | null = null;
      if (words.some((w) => w.startsWith(q))) rank = 10;
      else if (text.includes(q)) rank = 20;
      if (rank !== null) hits.push({ airport, rank: rank + KIND_RANK[airport.kind] });
    }
    return hits
      .sort((a, b) => a.rank - b.rank || a.airport.name.localeCompare(b.airport.name))
      .slice(0, limit);
  }
}
