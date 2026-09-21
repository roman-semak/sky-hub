import type { StaticIndex } from '@skytrace/static-data';
import { z } from 'zod';
import { USER_AGENT, type FetchFn } from '../ingest/provider.js';
import type { FlightRoute, RouteAirport } from './route.js';

export interface RouteProvider {
  readonly id: FlightRoute['source'];
  /** `null` = the provider knows no route for this callsign. Throws on transport errors. */
  lookup(callsign: string, lat: number | null, lon: number | null): Promise<FlightRoute | null>;
}

const TIMEOUT_MS = 8000;

interface JsonRequest {
  readonly method?: 'GET' | 'POST';
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

async function getJson(fetchFn: FetchFn, url: string, req: JsonRequest = {}): Promise<unknown> {
  const res = await fetchFn(url, {
    method: req.method ?? 'GET',
    ...(req.body === undefined ? {} : { body: req.body }),
    headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...req.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text.trim() === '' ? null : (JSON.parse(text) as unknown);
}

const AdsbLolAirport = z.looseObject({
  icao: z.string(),
  iata: z.string().nullish(),
  name: z.string().nullish(),
  location: z.string().nullish(),
  lat: z.number(),
  lon: z.number(),
});
const AdsbLolRoute = z.looseObject({
  callsign: z.string(),
  _airports: z.array(AdsbLolAirport).min(2),
  airline_code: z.string().nullish(),
});

function fromAdsbLol(a: z.infer<typeof AdsbLolAirport>): RouteAirport {
  return {
    icao: a.icao,
    iata: a.iata ?? null,
    name: a.name ?? a.icao,
    city: a.location ?? null,
    lat: a.lat,
    lon: a.lon,
  };
}

/** adsb.lol `POST /api/0/routeset` (SPEC § 1.6). Multi-leg routes use first and last airport. */
export class AdsbLolRouteProvider implements RouteProvider {
  readonly id = 'adsb.lol' as const;
  constructor(private readonly fetchFn: FetchFn = fetch) {}

  async lookup(
    callsign: string,
    lat: number | null,
    lon: number | null,
  ): Promise<FlightRoute | null> {
    const body = JSON.stringify({ planes: [{ callsign, lat: lat ?? 0, lng: lon ?? 0 }] });
    const json = await getJson(this.fetchFn, 'https://api.adsb.lol/api/0/routeset', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    });
    const parsed = z.array(AdsbLolRoute).safeParse(json);
    const first = parsed.success ? parsed.data[0] : undefined;
    if (first === undefined) return null;
    const origin = first._airports[0];
    const destination = first._airports[first._airports.length - 1];
    if (origin === undefined || destination === undefined) return null;
    return {
      callsign,
      origin: fromAdsbLol(origin),
      destination: fromAdsbLol(destination),
      airline: first.airline_code ?? null,
      source: this.id,
    };
  }
}

const AdsbdbAirport = z.looseObject({
  icao_code: z.string(),
  iata_code: z.string().nullish(),
  name: z.string(),
  municipality: z.string().nullish(),
  latitude: z.number(),
  longitude: z.number(),
});
const AdsbdbResponse = z.looseObject({
  response: z.looseObject({
    flightroute: z.looseObject({
      airline: z.looseObject({ name: z.string() }).nullish(),
      origin: AdsbdbAirport,
      destination: AdsbdbAirport,
    }),
  }),
});

function fromAdsbdb(a: z.infer<typeof AdsbdbAirport>): RouteAirport {
  return {
    icao: a.icao_code,
    iata: a.iata_code ?? null,
    name: a.name,
    city: a.municipality ?? null,
    lat: a.latitude,
    lon: a.longitude,
  };
}

/** adsbdb.com — free callsign → route database; fallback since adsb.lol's routeset went quiet (ADR-006). */
export class AdsbdbRouteProvider implements RouteProvider {
  readonly id = 'adsbdb' as const;
  constructor(private readonly fetchFn: FetchFn = fetch) {}

  async lookup(callsign: string): Promise<FlightRoute | null> {
    const json = await getJson(
      this.fetchFn,
      `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`,
    );
    const parsed = AdsbdbResponse.safeParse(json);
    if (!parsed.success) return null;
    const r = parsed.data.response.flightroute;
    return {
      callsign,
      origin: fromAdsbdb(r.origin),
      destination: fromAdsbdb(r.destination),
      airline: r.airline?.name ?? null,
      source: this.id,
    };
  }
}

/** Prefers names and coordinates from our own airport table when we have the code. */
export function canonicalizeRoute(route: FlightRoute, index: StaticIndex | null): FlightRoute {
  if (index === null) return route;
  const fix = (a: RouteAirport): RouteAirport => {
    const known = index.airport(a.icao);
    return known === null
      ? a
      : {
          icao: known.icao,
          iata: known.iata,
          name: known.name,
          city: known.city,
          lat: known.lat,
          lon: known.lon,
        };
  };
  return { ...route, origin: fix(route.origin), destination: fix(route.destination) };
}
