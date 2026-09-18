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
const SQUAWK_EMERGENCY: Readonly<Record<string, EmergencyKind>> = {
  '7500': 'unlawful',
  '7600': 'nordo',
  '7700': 'general',
};

export function resolveEmergency(
  field: string | undefined,
  squawk: string | undefined,
): EmergencyKind {
  const fromField: EmergencyKind =
    field !== undefined && KINDS.has(field) ? (field as EmergencyKind) : 'none';
  if (fromField !== 'none') return fromField;
  return (squawk !== undefined ? SQUAWK_EMERGENCY[squawk] : undefined) ?? 'none';
}
