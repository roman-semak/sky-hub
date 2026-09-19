import { z } from 'zod';

/**
 * Envelope of a `/v2` response. Aircraft entries are kept as `unknown` here
 * so that a single malformed aircraft is skipped instead of failing the whole
 * response — see {@link parseAdsbResponse}.
 *
 * Mirrors disagree on the envelope: adsb.lol sends `ac` and `now` in ms,
 * adsb.fi sends `aircraft` and `now` in (fractional) seconds.
 */
export const AdsbResponseSchema = z
  .looseObject({
    ac: z.array(z.unknown()).optional(),
    aircraft: z.array(z.unknown()).optional(),
    now: z.number(),
    total: z.number().optional(),
    ctime: z.number().optional(),
    ptime: z.number().optional(),
    msg: z.string().optional(),
  })
  .refine((body) => body.ac !== undefined || body.aircraft !== undefined, {
    message: 'response has neither `ac` nor `aircraft`',
  });

export type AdsbResponse = z.infer<typeof AdsbResponseSchema>;
