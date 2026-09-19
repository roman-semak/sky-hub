/** `"A3"` → `0x03`, `"B1"` → `0x11`; `0xff` = unknown. */
export function encodeCategory(category: string | null): number {
  if (category === null || !/^[A-D][0-7]$/.test(category)) return 0xff;
  return ((category.charCodeAt(0) - 65) << 4) | (category.charCodeAt(1) - 48);
}

export function decodeCategory(value: number): string | null {
  if (value === 0xff) return null;
  return String.fromCharCode(65 + (value >> 4), 48 + (value & 0x0f));
}
