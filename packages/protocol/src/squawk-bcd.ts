/**
 * Squawk codes are four octal digits; each goes into a 4-bit nibble (BCD),
 * `"7700"` → `0x7700`. `0xffff` (not valid BCD-octal) means "no squawk".
 */
export function encodeSquawk(squawk: string | null): number {
  if (squawk === null || !/^[0-7]{4}$/.test(squawk)) return 0xffff;
  return Number.parseInt(squawk, 16);
}

export function decodeSquawk(value: number): string | null {
  if (value === 0xffff) return null;
  return value.toString(16).padStart(4, '0');
}
