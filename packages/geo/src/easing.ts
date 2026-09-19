/**
 * Cubic ease-out: fast start, gentle landing. `t` is clamped to `[0, 1]`.
 *
 * f(t) = 1 − (1 − t)³
 *
 * @see https://easings.net/#easeOutCubic
 */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}
