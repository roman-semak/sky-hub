export interface IcaoId {
  readonly icao: number;
  readonly nonIcao: boolean;
}

/** `"4951ab"` → `{ icao: 0x4951ab }`, `"~4951ab"` → non-ICAO. */
export function hexToId(hex: string): IcaoId {
  const nonIcao = hex.startsWith('~');
  const icao = Number.parseInt(nonIcao ? hex.slice(1) : hex, 16);
  if (!Number.isInteger(icao) || icao < 0 || icao > 0xffffff) {
    throw new RangeError(`invalid ICAO24 "${hex}"`);
  }
  return { icao, nonIcao };
}

export function idToHex(icao: number, nonIcao: boolean): string {
  const hex = icao.toString(16).padStart(6, '0');
  return nonIcao ? `~${hex}` : hex;
}
