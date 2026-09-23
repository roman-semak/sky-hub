export interface IcaoId {
  readonly icao: number;
  readonly nonIcao: boolean;
}

/**
 * Six hex digits, optionally prefixed with `~` for a non-ICAO address.
 * `parseInt` alone would accept `"12345g"` and file it under `0x12345`,
 * silently mixing up two aircraft.
 */
const ICAO24 = /^~?[0-9a-fA-F]{6}$/;

/** `"4951ab"` → `{ icao: 0x4951ab }`, `"~4951ab"` → non-ICAO. */
export function hexToId(hex: string): IcaoId {
  if (!ICAO24.test(hex)) throw new RangeError(`invalid ICAO24 "${hex}"`);
  const nonIcao = hex.startsWith('~');
  return { icao: Number.parseInt(nonIcao ? hex.slice(1) : hex, 16), nonIcao };
}

export function idToHex(icao: number, nonIcao: boolean): string {
  const hex = icao.toString(16).padStart(6, '0');
  return nonIcao ? `~${hex}` : hex;
}
