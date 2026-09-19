import type { EmergencyKind } from '@skytrace/adsb-types';

const KINDS: readonly EmergencyKind[] = [
  'none',
  'general',
  'lifeguard',
  'minfuel',
  'nordo',
  'unlawful',
  'downed',
  'reserved',
];

export function encodeEmergency(kind: EmergencyKind): number {
  return Math.max(0, KINDS.indexOf(kind));
}

export function decodeEmergency(value: number): EmergencyKind {
  return KINDS[value] ?? 'none';
}
