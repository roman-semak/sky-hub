import type { Aircraft } from '@skytrace/adsb-types';

export interface DensityCell {
  /** Cell centre. */
  readonly lat: number;
  readonly lon: number;
  readonly count: number;
}

export interface DensityGridOptions {
  /** Cell size in degrees. */
  readonly cellDeg: number;
  /** How many hourly buckets to keep (SPEC phase 8: a day). */
  readonly hours: number;
}

/**
 * Half a degree (~30 nm) keeps a day of global traffic at tens of thousands of
 * cells; a quarter degree quadruples that for no visual gain, because the
 * client's blur radius already follows the cell size.
 */
export const DEFAULT_DENSITY_OPTIONS: DensityGridOptions = { cellDeg: 0.5, hours: 24 };

const HOUR_MS = 3_600_000;

/**
 * Rolling traffic-density grid (SPEC phase 8 heatmap).
 *
 * Counting positions as they arrive costs one integer per cell per hour,
 * instead of re-reading a day of Parquet for every request. Each cell keeps
 * one counter per hour of the window; buckets are cleared as the hour rolls
 * over, so the grid always covers the last `hours` hours.
 */
export class DensityGrid {
  private readonly cells = new Map<number, Uint32Array>();
  private readonly cols: number;
  private currentHour = -1;

  constructor(private readonly opts: DensityGridOptions = DEFAULT_DENSITY_OPTIONS) {
    this.cols = Math.ceil(360 / opts.cellDeg);
  }

  get cellDeg(): number {
    return this.opts.cellDeg;
  }

  record(ac: Aircraft, now = Date.now()): void {
    if (ac.onGround) return;
    const hour = Math.floor(now / HOUR_MS);
    if (hour !== this.currentHour) this.rollTo(hour);
    const key = this.key(ac.lat, ac.lon);
    let buckets = this.cells.get(key);
    if (buckets === undefined) {
      buckets = new Uint32Array(this.opts.hours);
      this.cells.set(key, buckets);
    }
    const slot = hour % this.opts.hours;
    // Saturate instead of wrapping around at a busy airport.
    if ((buckets[slot] ?? 0) < 0xffffffff) buckets[slot] = (buckets[slot] ?? 0) + 1;
  }

  /** Cells inside `[w, s, e, n]` with their totals over the window. */
  query(
    bbox: readonly [number, number, number, number],
    limit = 8000,
    now = Date.now(),
  ): DensityCell[] {
    const hour = Math.floor(now / HOUR_MS);
    if (hour !== this.currentHour) this.rollTo(hour);
    const [w, s, e, n] = bbox;
    const out: DensityCell[] = [];
    for (const [key, buckets] of this.cells) {
      const { lat, lon } = this.centre(key);
      if (lat < s || lat > n) continue;
      if (w <= e ? lon < w || lon > e : lon < w && lon > e) continue;
      let count = 0;
      for (const v of buckets) count += v;
      if (count > 0) out.push({ lat, lon, count });
    }
    return out.sort((a, b) => b.count - a.count).slice(0, limit);
  }

  get size(): number {
    return this.cells.size;
  }

  /** Clears the buckets the new hour is about to reuse, and drops empty cells. */
  private rollTo(hour: number): void {
    if (this.currentHour === -1) {
      this.currentHour = hour;
      return;
    }
    const elapsed = Math.min(this.opts.hours, hour - this.currentHour);
    for (let i = 1; i <= elapsed; i++) {
      const slot = (this.currentHour + i) % this.opts.hours;
      for (const buckets of this.cells.values()) buckets[slot] = 0;
    }
    for (const [key, buckets] of this.cells) {
      if (buckets.every((v) => v === 0)) this.cells.delete(key);
    }
    this.currentHour = hour;
  }

  private key(lat: number, lon: number): number {
    const row = Math.floor((lat + 90) / this.opts.cellDeg);
    const col = Math.floor((lon + 180) / this.opts.cellDeg);
    return row * this.cols + col;
  }

  private centre(key: number): { lat: number; lon: number } {
    const row = Math.floor(key / this.cols);
    const col = key % this.cols;
    return {
      lat: (row + 0.5) * this.opts.cellDeg - 90,
      lon: (col + 0.5) * this.opts.cellDeg - 180,
    };
  }
}
