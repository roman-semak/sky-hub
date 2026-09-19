/**
 * Iterative Ramer–Douglas–Peucker polyline simplification in planar
 * lon/lat space (SPEC § 6.2 uses ε in degrees).
 *
 * Keeps the first and last point; recursively keeps the point with the largest
 * perpendicular distance to the current segment if it exceeds `epsilon`.
 *
 * @see https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
 * @param points input points (not mutated)
 * @param getXY accessor returning `[x, y]` = `[lon, lat]`
 * @returns the kept points, in original order
 */
export function simplifyRdp<T>(
  points: readonly T[],
  epsilon: number,
  getXY: (p: T) => readonly [number, number],
): T[] {
  const n = points.length;
  if (n <= 2) return [...points];
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  points.forEach((p, i) => {
    const [x, y] = getXY(p);
    xs[i] = x;
    ys[i] = y;
  });
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const eps2 = epsilon * epsilon;
  for (let seg = stack.pop(); seg !== undefined; seg = stack.pop()) {
    const [a, b] = seg;
    const ax = xs[a] ?? 0;
    const ay = ys[a] ?? 0;
    const dx = (xs[b] ?? 0) - ax;
    const dy = (ys[b] ?? 0) - ay;
    const len2 = dx * dx + dy * dy;
    let maxD2 = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const px = (xs[i] ?? 0) - ax;
      const py = (ys[i] ?? 0) - ay;
      let d2: number;
      if (len2 === 0) {
        d2 = px * px + py * py;
      } else {
        const cross = px * dy - py * dx;
        d2 = (cross * cross) / len2;
      }
      if (d2 > maxD2) {
        maxD2 = d2;
        idx = i;
      }
    }
    if (idx !== -1 && maxD2 > eps2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}
