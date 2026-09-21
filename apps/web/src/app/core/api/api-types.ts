import type { Aircraft } from '@skytrace/adsb-types';

/** Wire types of the REST API (apps/server/src/app.ts). */
export interface RouteAirport {
  readonly icao: string;
  readonly iata: string | null;
  readonly name: string;
  readonly city: string | null;
  readonly lat: number;
  readonly lon: number;
}

export interface FlightRoute {
  readonly callsign: string;
  readonly origin: RouteAirport;
  readonly destination: RouteAirport;
  readonly airline: string | null;
  readonly source: string;
}

export interface EnrichedAircraft extends Aircraft {
  readonly country: string | null;
  readonly airline: {
    readonly name: string;
    readonly iata: string | null;
    readonly icao: string;
  } | null;
  readonly aircraftType: {
    readonly code: string;
    readonly name: string;
    readonly wtc: string | null;
  } | null;
}

export interface TrackPoint {
  readonly t: number;
  readonly lat: number;
  readonly lon: number;
  readonly alt: number | null;
  readonly gs: number | null;
  readonly track: number | null;
  readonly vr: number | null;
}

export interface TrackResponse {
  readonly hex: string;
  readonly points: readonly TrackPoint[];
  readonly raw: number;
}

export type SearchResult =
  | {
      readonly kind: 'aircraft';
      readonly hex: string;
      readonly callsign: string | null;
      readonly registration: string | null;
      readonly typeCode: string | null;
      readonly lat: number;
      readonly lon: number;
    }
  | ({ readonly kind: 'airport'; readonly size: string } & RouteAirport & {
        readonly country: string;
      })
  | {
      readonly kind: 'airline';
      readonly icao: string;
      readonly iata: string | null;
      readonly name: string;
      readonly callsign: string | null;
      readonly country: string | null;
    };
