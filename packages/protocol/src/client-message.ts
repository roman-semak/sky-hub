import { FilterSpecSchema } from '@skytrace/adsb-types';
import { z } from 'zod';

const lon = z.number().min(-180).max(180);
const lat = z.number().min(-90).max(90);
const hex = z.string().regex(/^~?[0-9a-f]{6}$/);

/** Client → server control messages, JSON text frames (SPEC § 4.1). */
export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('sub'),
    bbox: z.tuple([lon, lat, lon, lat]).refine(([, s, , n]) => s <= n, 'south must be <= north'),
    zoom: z.number().min(0).max(24),
  }),
  z.object({ t: z.literal('watch'), hex }),
  z.object({ t: z.literal('unwatch'), hex }),
  z.object({ t: z.literal('filter'), f: FilterSpecSchema }),
  z.object({ t: z.literal('pong'), ts: z.number() }),
  /** Count what a filter would show in the current viewport, without applying it. */
  z.object({ t: z.literal('preview'), f: FilterSpecSchema, id: z.number().int().nonnegative() }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
