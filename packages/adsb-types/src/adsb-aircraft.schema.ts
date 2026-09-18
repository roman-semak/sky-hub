import { z } from 'zod';

/**
 * Raw aircraft object as returned by the readsb-compatible `/v2` API
 * (adsb.lol, airplanes.live, adsb.fi, adsb.one).
 *
 * Only the fields we consume are declared; unknown keys pass through because
 * providers add fields without notice and that must not break ingest.
 */
export const AdsbAircraftSchema = z.looseObject({
  hex: z.string().regex(/^~?[0-9a-fA-F]{6}$/),
  type: z.string().optional(),
  flight: z.string().optional(),
  r: z.string().optional(),
  t: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  alt_baro: z.union([z.number(), z.literal('ground')]).optional(),
  alt_geom: z.number().optional(),
  gs: z.number().optional(),
  track: z.number().optional(),
  baro_rate: z.number().optional(),
  geom_rate: z.number().optional(),
  squawk: z.string().optional(),
  emergency: z.string().optional(),
  category: z.string().optional(),
  nav_altitude_mcp: z.number().optional(),
  seen: z.number().optional(),
  seen_pos: z.number().optional(),
  messages: z.number().optional(),
  rssi: z.number().optional(),
  mlat: z.array(z.string()).optional(),
  tisb: z.array(z.string()).optional(),
  dbFlags: z.number().int().optional(),
});

export type AdsbAircraft = z.infer<typeof AdsbAircraftSchema>;
