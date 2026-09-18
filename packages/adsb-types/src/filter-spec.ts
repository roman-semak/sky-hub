import { z } from 'zod';

const range = z
  .tuple([z.number(), z.number()])
  .refine(([min, max]) => min <= max, { message: 'range min must be <= max' });

/** Client-side filter, also sent to the server via `{ t: 'filter' }`. */
export const FilterSpecSchema = z.strictObject({
  /** Barometric altitude band, feet. */
  altitude: range.optional(),
  /** Ground speed band, knots. */
  speed: range.optional(),
  /** ICAO type designators, e.g. `A20N`. */
  types: z.array(z.string().max(4)).max(50).optional(),
  /** Airline ICAO prefixes of the callsign, e.g. `TAP`. */
  operators: z.array(z.string().max(3)).max(50).optional(),
  /** ISO-3166 alpha-2 country codes derived from the ICAO24 block. */
  countries: z.array(z.string().length(2)).max(50).optional(),
  militaryOnly: z.boolean().optional(),
  emergencyOnly: z.boolean().optional(),
  laddOnly: z.boolean().optional(),
});

export type FilterSpec = z.infer<typeof FilterSpecSchema>;
