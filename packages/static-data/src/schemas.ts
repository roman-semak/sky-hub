import { z } from 'zod';

export const AirportSchema = z.object({
  icao: z.string().min(3).max(4),
  iata: z.string().length(3).nullable(),
  name: z.string(),
  city: z.string().nullable(),
  /** ISO-3166 alpha-2. */
  country: z.string().length(2),
  lat: z.number(),
  lon: z.number(),
  elevationFt: z.number().nullable(),
  kind: z.enum(['large', 'medium', 'small']),
});
export type Airport = z.infer<typeof AirportSchema>;

export const AirlineSchema = z.object({
  icao: z.string().length(3),
  iata: z.string().length(2).nullable(),
  name: z.string(),
  /** Radio callsign, e.g. `AIR PORTUGAL`. */
  callsign: z.string().nullable(),
  country: z.string().nullable(),
});
export type Airline = z.infer<typeof AirlineSchema>;

export const AircraftTypeSchema = z.object({
  /** ICAO type designator, e.g. `A20N`. */
  code: z.string().min(2).max(4),
  name: z.string(),
  /** ICAO description: class · engines · engine type, e.g. `L2J`. */
  desc: z.string().nullable(),
  /** Wake turbulence category L / M / H / J. */
  wtc: z.string().nullable(),
});
export type AircraftType = z.infer<typeof AircraftTypeSchema>;

export const StaticDatasetsSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  airports: z.array(AirportSchema),
  airlines: z.array(AirlineSchema),
  types: z.array(AircraftTypeSchema),
});
export type StaticDatasets = z.infer<typeof StaticDatasetsSchema>;
