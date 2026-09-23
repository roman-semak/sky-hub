import type { EmergencyKind } from './aircraft.js';

const KINDS: ReadonlySet<string> = new Set<EmergencyKind>([
  'none',
  'general',
  'lifeguard',
  'minfuel',
  'nordo',
  'unlawful',
  'downed',
  'reserved',
]);

// Transponder codes are authoritative even when the `emergency` field lags
// behind (older transponders never set it).
// A Map, not an object: provider strings are untrusted, and `"constructor"`
// would otherwise resolve to an inherited function that `?? 'none'` misses.
const SQUAWK_EMERGENCY: ReadonlyMap<string, EmergencyKind> = new Map([
  ['7500', 'unlawful'],
  ['7600', 'nordo'],
  ['7700', 'general'],
]);

/** Both fields arrive as raw provider strings, padding included. */
export function resolveEmergency(
  field: string | undefined,
  squawk: string | undefined,
): EmergencyKind {
  const kind = field?.trim();
  if (kind !== undefined && kind !== 'none' && KINDS.has(kind)) return kind as EmergencyKind;
  return SQUAWK_EMERGENCY.get(squawk?.trim() ?? '') ?? 'none';
}
