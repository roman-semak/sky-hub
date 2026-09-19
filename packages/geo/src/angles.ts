const DEG = Math.PI / 180;

export function toRad(deg: number): number {
  return deg * DEG;
}

export function toDeg(rad: number): number {
  return rad / DEG;
}

/** Normalizes a bearing into `[0, 360)`. */
export function normalizeBearing(deg: number): number {
  const r = deg % 360;
  if (r >= 0) return r + 0; // `+ 0` turns -0 into 0
  const wrapped = r + 360;
  // Tiny negatives round up to exactly 360 in float arithmetic.
  return wrapped === 360 ? 0 : wrapped;
}

/** Normalizes a longitude into `[-180, 180)`. */
export function normalizeLon(lon: number): number {
  return normalizeBearing(lon + 180) - 180;
}

/**
 * Signed shortest rotation from `from` to `to`, in `(-180, 180]` degrees.
 * Handles the 359° → 1° wrap (+2°, not −358°).
 */
export function shortestAngleDelta(from: number, to: number): number {
  const d = normalizeBearing(to - from);
  return d > 180 ? d - 360 : d;
}

/** Interpolates bearings along the short arc; `t` in `[0, 1]`. */
export function lerpAngle(from: number, to: number, t: number): number {
  return normalizeBearing(from + shortestAngleDelta(from, to) * t);
}
