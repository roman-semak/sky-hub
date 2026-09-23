import { z } from 'zod';

/** Only the fields the tools render; the API sends more. */
export const FlightSchema = z.object({
  hex: z.string(),
  callsign: z.string().nullable(),
  registration: z.string().nullable(),
  typeCode: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  altBaro: z.number().nullable(),
  gs: z.number().nullable(),
  track: z.number().nullable(),
  baroRate: z.number().nullable(),
  squawk: z.string().nullable(),
  emergency: z.string(),
  military: z.boolean(),
  onGround: z.boolean(),
  posTime: z.number(),
  country: z.string().nullable(),
  airline: z.object({ name: z.string() }).nullable(),
  aircraftType: z.object({ name: z.string() }).nullable(),
});
export type Flight = z.infer<typeof FlightSchema>;

const AircraftHit = z.object({
  kind: z.literal('aircraft'),
  hex: z.string(),
  callsign: z.string().nullable(),
  registration: z.string().nullable(),
  typeCode: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
});
const AirportHit = z.object({
  kind: z.literal('airport'),
  icao: z.string(),
  iata: z.string().nullable(),
  name: z.string(),
  country: z.string(),
});
const AirlineHit = z.object({
  kind: z.literal('airline'),
  name: z.string(),
  icao: z.string().nullable(),
});
export const SearchSchema = z.object({
  results: z.array(z.union([AircraftHit, AirportHit, AirlineHit])),
});
export type SearchHit = z.infer<typeof SearchSchema>['results'][number];

export const OverheadSchema = z.object({
  observer: z.object({ lat: z.number(), lon: z.number(), elevationFt: z.number() }),
  aircraft: z.array(
    z.object({
      hex: z.string(),
      callsign: z.string().nullable(),
      registration: z.string().nullable(),
      typeCode: z.string().nullable(),
      altitude: z.number().nullable(),
      gs: z.number().nullable(),
      azimuth: z.number(),
      elevation: z.number(),
      slantRangeNm: z.number(),
      groundRangeNm: z.number(),
    }),
  ),
});

const RouteAirport = z.object({
  icao: z.string(),
  iata: z.string().nullable(),
  name: z.string(),
  city: z.string().nullable(),
});
export const RouteSchema = z.object({
  callsign: z.string(),
  origin: RouteAirport,
  destination: RouteAirport,
  airline: z.string().nullable(),
  source: z.string(),
});

export const AirportSchema = z.object({
  icao: z.string(),
  iata: z.string().nullable(),
  name: z.string(),
  country: z.string(),
  lat: z.number(),
  lon: z.number(),
  metar: z
    .object({
      raw: z.string(),
      observedAt: z.number(),
      windDir: z.number().nullable(),
      windKt: z.number().nullable(),
      visibility: z.string().nullable(),
      category: z.string().nullable(),
    })
    .nullable(),
  taf: z.object({ raw: z.string() }).nullable(),
  traffic: z.array(
    z.object({
      hex: z.string(),
      callsign: z.string().nullable(),
      typeCode: z.string().nullable(),
      role: z.string(),
      distanceNm: z.number(),
      altitude: z.number().nullable(),
    }),
  ),
});

export const StatsSchema = z.object({
  generatedAt: z.number(),
  total: z.number(),
  airborne: z.number(),
  onGround: z.number(),
  military: z.number(),
  emergencies: z.array(
    z.object({ hex: z.string(), callsign: z.string().nullable(), squawk: z.string().nullable() }),
  ),
  altitudeBands: z.array(z.tuple([z.number(), z.number()])),
  topOperators: z.array(z.tuple([z.string(), z.number()])),
  topTypes: z.array(z.tuple([z.string(), z.number()])),
});

export const TrackSchema = z.object({
  hex: z.string(),
  points: z.array(
    z.object({
      t: z.number(),
      lat: z.number(),
      lon: z.number(),
      alt: z.number().nullable(),
      gs: z.number().nullable(),
    }),
  ),
});

export const HeatmapSchema = z.object({
  windowHours: z.number(),
  cellDeg: z.number(),
  max: z.number(),
  cells: z.array(z.object({ lat: z.number(), lon: z.number(), count: z.number() })),
});
