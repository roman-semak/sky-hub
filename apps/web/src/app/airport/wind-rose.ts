export interface WindObservation {
  /** Direction the wind blows from, degrees true. */
  readonly dir: number;
  readonly kt: number;
}

/** Speed bands of the rose, knots (upper bounds; the last one is open-ended). */
export const SPEED_BANDS: readonly number[] = [5, 10, 20, Infinity];

export interface RoseSector {
  /** Centre of the sector, degrees true. */
  readonly dir: number;
  /** Share of all observations per speed band, in `[0, 1]`. */
  readonly bands: readonly number[];
  readonly total: number;
}

/**
 * Bins observations into `sectors` compass sectors × {@link SPEED_BANDS}.
 * Sector `i` is centred on `i · 360 / sectors`; 355° and 5° share the north
 * sector. Calm winds (0 kt) have no direction and are counted separately.
 */
export function windRose(
  obs: readonly WindObservation[],
  sectors = 16,
): { sectors: RoseSector[]; calm: number } {
  const width = 360 / sectors;
  const counts = Array.from({ length: sectors }, () =>
    new Array<number>(SPEED_BANDS.length).fill(0),
  );
  let calm = 0;
  for (const o of obs) {
    if (o.kt <= 0) {
      calm++;
      continue;
    }
    const sector = Math.floor((((o.dir % 360) + 360 + width / 2) % 360) / width) % sectors;
    const band = SPEED_BANDS.findIndex((max) => o.kt <= max);
    const row = counts[sector];
    if (row !== undefined) row[band] = (row[band] ?? 0) + 1;
  }
  const n = obs.length === 0 ? 1 : obs.length;
  return {
    calm: calm / n,
    sectors: counts.map((row, i) => ({
      dir: i * width,
      bands: row.map((c) => c / n),
      total: row.reduce((a, b) => a + b, 0) / n,
    })),
  };
}

/** SVG path of an annular sector (wedge between two radii), angles in compass degrees. */
export function wedgePath(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  fromDeg: number,
  toDeg: number,
): string {
  const pt = (r: number, deg: number): string => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  };
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return [
    `M ${pt(r0, fromDeg)}`,
    `L ${pt(r1, fromDeg)}`,
    `A ${r1} ${r1} 0 ${large} 1 ${pt(r1, toDeg)}`,
    `L ${pt(r0, toDeg)}`,
    `A ${r0} ${r0} 0 ${large} 0 ${pt(r0, fromDeg)}`,
    'Z',
  ].join(' ');
}
