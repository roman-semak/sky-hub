/**
 * Altitude colour ramp modelled on tar1090: ground → yellow → green → blue →
 * violet at FL400+. Stops are `[feet, r, g, b]`.
 *
 * @see https://github.com/wiedehopf/tar1090 (default altitude colours)
 */
export const ALTITUDE_STOPS: readonly (readonly [number, number, number, number])[] = [
  [0, 214, 116, 52],
  [2000, 242, 181, 48],
  [6000, 214, 214, 58],
  [10000, 92, 206, 96],
  [20000, 66, 186, 190],
  [30000, 82, 132, 232],
  [40000, 168, 102, 240],
];

/** Sentinel altitudes understood by the GPU ramp. */
export const ALT_UNKNOWN = -9000;
export const ALT_EMERGENCY = -9001;
export const ALT_SELECTED = -9002;
/** Used when the military highlight layer is on (SPEC phase 8). */
export const ALT_MILITARY = -9003;

export const UNKNOWN_RGB: readonly [number, number, number] = [160, 164, 180];
export const EMERGENCY_RGB: readonly [number, number, number] = [255, 84, 84];
export const SELECTED_RGB: readonly [number, number, number] = [210, 206, 253];
export const MILITARY_RGB: readonly [number, number, number] = [138, 201, 38];

/**
 * CPU reference implementation of the ramp (piecewise-linear in feet). The
 * GPU version in {@link altitudeColorGlsl} is generated from the same stops
 * and must agree with this one; see the unit test.
 */
export function altitudeColor(altFt: number): [number, number, number] {
  if (altFt === ALT_EMERGENCY) return [...EMERGENCY_RGB];
  if (altFt === ALT_SELECTED) return [...SELECTED_RGB];
  if (altFt === ALT_MILITARY) return [...MILITARY_RGB];
  if (altFt <= ALT_UNKNOWN) return [...UNKNOWN_RGB];
  const first = ALTITUDE_STOPS[0];
  const last = ALTITUDE_STOPS[ALTITUDE_STOPS.length - 1];
  if (first === undefined || last === undefined) return [...UNKNOWN_RGB];
  if (altFt <= first[0]) return [first[1], first[2], first[3]];
  for (let i = 1; i < ALTITUDE_STOPS.length; i++) {
    const a = ALTITUDE_STOPS[i - 1];
    const b = ALTITUDE_STOPS[i];
    if (a === undefined || b === undefined) break;
    if (altFt <= b[0]) {
      const t = (altFt - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
    }
  }
  return [last[1], last[2], last[3]];
}

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : n.toString());
const rgb = (c: readonly [number, number, number]): string =>
  `vec3(${c.map((v) => f(v / 255)).join(', ')})`;

/** GLSL source of `vec3 altitudeColor(float altFt)`, generated from {@link ALTITUDE_STOPS}. */
export function altitudeColorGlsl(): string {
  const lines = ['vec3 altitudeColor(float altFt) {'];
  lines.push(`  if (altFt == ${f(ALT_EMERGENCY)}) return ${rgb(EMERGENCY_RGB)};`);
  lines.push(`  if (altFt == ${f(ALT_SELECTED)}) return ${rgb(SELECTED_RGB)};`);
  lines.push(`  if (altFt == ${f(ALT_MILITARY)}) return ${rgb(MILITARY_RGB)};`);
  lines.push(`  if (altFt <= ${f(ALT_UNKNOWN)}) return ${rgb(UNKNOWN_RGB)};`);
  const [s0] = ALTITUDE_STOPS;
  if (s0 !== undefined)
    lines.push(`  if (altFt <= ${f(s0[0])}) return ${rgb([s0[1], s0[2], s0[3]])};`);
  for (let i = 1; i < ALTITUDE_STOPS.length; i++) {
    const a = ALTITUDE_STOPS[i - 1];
    const b = ALTITUDE_STOPS[i];
    if (a === undefined || b === undefined) continue;
    lines.push(
      `  if (altFt <= ${f(b[0])}) return mix(${rgb([a[1], a[2], a[3]])}, ${rgb([b[1], b[2], b[3]])}, (altFt - ${f(a[0])}) / ${f(b[0] - a[0])});`,
    );
  }
  const z = ALTITUDE_STOPS[ALTITUDE_STOPS.length - 1];
  lines.push(`  return ${z === undefined ? rgb(UNKNOWN_RGB) : rgb([z[1], z[2], z[3]])};`);
  lines.push('}');
  return lines.join('\n');
}
