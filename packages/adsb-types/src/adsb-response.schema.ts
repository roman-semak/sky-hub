import { z } from 'zod';

/**
 * Envelope of a `/v2` response. Aircraft entries are kept as `unknown` here
 * so that a single malformed aircraft is skipped instead of failing the whole
 * response — see {@link parseAdsbResponse}.
 */
export const AdsbResponseSchema = z.looseObject({
  ac: z.array(z.unknown()),
  now: z.number(),
  total: z.number().optional(),
  ctime: z.number().optional(),
  ptime: z.number().optional(),
  msg: z.string().optional(),
});

export type AdsbResponse = z.infer<typeof AdsbResponseSchema>;
