/** Wind grid as served by `/api/wind` (apps/server/src/weather/wind-aloft.ts). */
export interface WindGrid {
  readonly level: number;
  readonly time: number;
  readonly cols: number;
  readonly rows: number;
  readonly bbox: readonly [number, number, number, number];
  readonly u: readonly number[];
  readonly v: readonly number[];
}

/**
 * Bilinear interpolation of the u/v grid at a point, m/s. Outside the grid
 * the nearest edge value is used.
 *
 * @see https://en.wikipedia.org/wiki/Bilinear_interpolation
 */
export function sampleWind(g: WindGrid, lat: number, lon: number): [number, number] {
  const [w, s, e, n] = g.bbox;
  const fx = Math.min(g.cols - 1, Math.max(0, ((lon - w) / (e - w || 1)) * (g.cols - 1)));
  const fy = Math.min(g.rows - 1, Math.max(0, ((lat - s) / (n - s || 1)) * (g.rows - 1)));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(g.cols - 1, x0 + 1);
  const y1 = Math.min(g.rows - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (arr: readonly number[], x: number, y: number): number => arr[y * g.cols + x] ?? 0;
  const lerp2 = (arr: readonly number[]): number =>
    (at(arr, x0, y0) * (1 - tx) + at(arr, x1, y0) * tx) * (1 - ty) +
    (at(arr, x0, y1) * (1 - tx) + at(arr, x1, y1) * tx) * ty;
  return [lerp2(g.u), lerp2(g.v)];
}

/**
 * Particle system for the wind layer. Particles drift with the interpolated
 * wind (visually sped up) and respawn at random points when they age out or
 * leave the view, the classic earth.nullschool approach.
 */
export class WindParticles {
  readonly count: number;
  /** Current and trailing positions, `[lon, lat]` pairs, for a LineLayer. */
  readonly head: Float32Array;
  readonly tail: Float32Array;
  readonly alpha: Uint8Array;
  private readonly age: Uint16Array;
  private readonly maxAge: number;

  constructor(
    count: number,
    private bbox: readonly [number, number, number, number],
    private readonly random: () => number = Math.random,
  ) {
    this.count = count;
    this.head = new Float32Array(count * 2);
    this.tail = new Float32Array(count * 2);
    this.alpha = new Uint8Array(count * 4);
    this.age = new Uint16Array(count);
    this.maxAge = 90;
    for (let i = 0; i < count; i++) this.spawn(i, Math.floor(this.random() * this.maxAge));
  }

  setView(bbox: readonly [number, number, number, number]): void {
    this.bbox = bbox;
    for (let i = 0; i < this.count; i++) this.spawn(i, Math.floor(this.random() * this.maxAge));
  }

  /**
   * Advances every particle by one frame. `degPerMs` scales wind speed to
   * screen motion: 1 m/s moves `degPerMs · dtMs` degrees.
   */
  step(grid: WindGrid, dtMs: number, degPerMs: number): void {
    const [w, s, e, n] = this.bbox;
    for (let i = 0; i < this.count; i++) {
      const lon = this.head[i * 2] ?? 0;
      const lat = this.head[i * 2 + 1] ?? 0;
      const [u, v] = sampleWind(grid, lat, lon);
      const k = dtMs * degPerMs;
      const nextLon = lon + (u * k) / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
      const nextLat = lat + v * k;
      const age = (this.age[i] ?? 0) + 1;
      if (age > this.maxAge || nextLon < w || nextLon > e || nextLat < s || nextLat > n) {
        this.spawn(i, 0);
        continue;
      }
      this.age[i] = age;
      // The tail lags a few frames behind, so each particle reads as a streak.
      this.tail[i * 2] = lon - (nextLon - lon) * 6;
      this.tail[i * 2 + 1] = lat - (nextLat - lat) * 6;
      this.head[i * 2] = nextLon;
      this.head[i * 2 + 1] = nextLat;
      const speed = Math.hypot(u, v);
      const fade = Math.sin((Math.PI * age) / this.maxAge);
      this.alpha[i * 4] = 233;
      this.alpha[i * 4 + 1] = 233;
      this.alpha[i * 4 + 2] = 237;
      this.alpha[i * 4 + 3] = Math.round(Math.min(1, 0.25 + speed / 60) * fade * 200);
    }
  }

  private spawn(i: number, age: number): void {
    const [w, s, e, n] = this.bbox;
    const lon = w + this.random() * (e - w);
    const lat = s + this.random() * (n - s);
    this.head[i * 2] = lon;
    this.head[i * 2 + 1] = lat;
    this.tail[i * 2] = lon;
    this.tail[i * 2 + 1] = lat;
    this.alpha[i * 4 + 3] = 0;
    this.age[i] = age;
  }
}
