/** One end of a route. Coordinates allow great-circle progress on the client. */
export interface RouteAirport {
  readonly icao: string;
  readonly iata: string | null;
  readonly name: string;
  readonly city: string | null;
  readonly lat: number;
  readonly lon: number;
}

/** Scheduled route for a callsign, from free route databases (SPEC § 1.6). */
export interface FlightRoute {
  readonly callsign: string;
  readonly origin: RouteAirport;
  readonly destination: RouteAirport;
  readonly airline: string | null;
  readonly source: 'adsb.lol' | 'adsbdb';
}
