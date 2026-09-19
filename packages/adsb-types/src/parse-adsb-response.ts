import { AdsbAircraftSchema } from './adsb-aircraft.schema.js';
import { AdsbResponseSchema } from './adsb-response.schema.js';
import type { Aircraft } from './aircraft.js';
import { normalizeAircraft } from './normalize-aircraft.js';

export interface ParsedAdsbResponse {
  readonly now: number;
  readonly aircraft: readonly Aircraft[];
  /** Entries that failed validation and were skipped. */
  readonly invalid: number;
  /** Valid entries without a position. */
  readonly positionless: number;
}

// Anything below 1e12 cannot be a plausible unix-ms timestamp (that is 2001).
const MS_THRESHOLD = 1e12;

function toUnixMs(now: number): number {
  return now < MS_THRESHOLD ? Math.round(now * 1000) : now;
}

export type ParseResult =
  | { readonly ok: true; readonly value: ParsedAdsbResponse }
  | { readonly ok: false; readonly error: string };

/**
 * Validates a provider response. Never throws: a broken envelope is reported
 * as an error, broken aircraft entries are counted and skipped.
 */
export function parseAdsbResponse(body: unknown): ParseResult {
  const envelope = AdsbResponseSchema.safeParse(body);
  if (!envelope.success) {
    return { ok: false, error: envelope.error.message };
  }
  const { ac, aircraft: acAlt, now: rawNow } = envelope.data;
  const entries = ac ?? acAlt ?? [];
  const now = toUnixMs(rawNow);
  const aircraft: Aircraft[] = [];
  let invalid = 0;
  let positionless = 0;
  for (const entry of entries) {
    const parsed = AdsbAircraftSchema.safeParse(entry);
    if (!parsed.success) {
      invalid++;
      continue;
    }
    const normalized = normalizeAircraft(parsed.data, now);
    if (normalized === null) positionless++;
    else aircraft.push(normalized);
  }
  return { ok: true, value: { now, aircraft, invalid, positionless } };
}
