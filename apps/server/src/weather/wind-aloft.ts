import { z } from 'zod';
import { USER_AGENT, type FetchFn } from '../ingest/provider.js';

/** Pressure levels offered in the UI, with the flight level they roughly match. */
export const WIND_LEVELS = { 850: 'FL050', 500: 'FL180', 250: 'FL340' } as const;
export type WindLevel = keyof typeof WIND_LEVELS;

export interface WindGrid {
  readonly level: WindLevel;
  /** Hour of the forecast used, unix ms. */
  readonly time: number;
  readonly cols: number;
  readonly rows: number;
  readonly bbox: readonly [number, number, number, number];
  /** Row-major from south-west: eastward and northward wind, m/s. */
  readonly u: readonly number[];
  readonly v: readonly number[];
}

const Point = z.looseObject({
  hourly: z.looseObject({ time: z.array(z.string()) }).catchall(z.array(z.number().nullable())),
});

const KMH_TO_MS = 1 / 3.6;
const GRID = 8;

/**
 * Wind aloft from Open-Meteo pressure-level forecasts (SPEC § 1.5), sampled
 * on an 8 × 8 grid over the viewport in one multi-location request.
 * Direction is meteorological (where the wind comes from), so the vector
 * points the opposite way.
 */
export class WindAloft {
  private readonly cache = new Map<string, { at: number; grid: WindGrid }>();

  constructor(
    private readonly fetchFn: FetchFn = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async grid(
    bbox: readonly [number, number, number, number],
    level: WindLevel,
  ): Promise<WindGrid | null> {
    // Snap to 0.5° so nearby viewports share cache entries and requests, but
    // never to a zero-area box: a city-sized viewport would collapse to one
    // point sampled 64 times, and the client divides by the box's size.
    const snap = (v: number): number => Math.round(v * 2) / 2;
    const w = snap(bbox[0]);
    const s0 = snap(bbox[1]);
    const box = [
      w,
      s0,
      Math.max(snap(bbox[2]), w + 0.5),
      Math.max(snap(bbox[3]), s0 + 0.5),
    ] as const;
    const key = `${box.join(',')}:${level}`;
    const hit = this.cache.get(key);
    if (hit !== undefined && this.now() - hit.at < 30 * 60_000) return hit.grid;

    const lats: number[] = [];
    const lons: number[] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        lats.push(box[1] + ((box[3] - box[1]) * r) / (GRID - 1));
        lons.push(box[0] + ((box[2] - box[0]) * c) / (GRID - 1));
      }
    }
    const url =
      'https://api.open-meteo.com/v1/forecast?' +
      new URLSearchParams({
        latitude: lats.map((v) => v.toFixed(3)).join(','),
        longitude: lons.map((v) => v.toFixed(3)).join(','),
        hourly: `wind_speed_${level}hPa,wind_direction_${level}hPa`,
        forecast_days: '1',
        timezone: 'UTC',
      }).toString();
    let json: unknown;
    try {
      const res = await this.fetchFn(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return hit?.grid ?? null;
      json = await res.json();
    } catch {
      return hit?.grid ?? null;
    }
    const points = z.array(Point).safeParse(Array.isArray(json) ? json : [json]);
    if (!points.success || points.data.length !== GRID * GRID) return hit?.grid ?? null;

    const hourIso = new Date(Math.floor(this.now() / 3_600_000) * 3_600_000)
      .toISOString()
      .slice(0, 16);
    // Every point shares the same hourly axis. If this hour is missing, the
    // answer is not for now, and serving 00:00 UTC labelled as the current
    // hour is worse than serving nothing.
    const idx = points.data[0]?.hourly.time.indexOf(hourIso) ?? -1;
    if (idx < 0) return hit?.grid ?? null;
    const u: number[] = [];
    const v: number[] = [];
    for (const p of points.data) {
      const speed = (p.hourly[`wind_speed_${level}hPa`]?.[idx] ?? 0) * KMH_TO_MS;
      const dir = ((p.hourly[`wind_direction_${level}hPa`]?.[idx] ?? 0) * Math.PI) / 180;
      u.push(-speed * Math.sin(dir));
      v.push(-speed * Math.cos(dir));
    }
    const grid: WindGrid = {
      level,
      time: Date.parse(`${hourIso}:00Z`),
      cols: GRID,
      rows: GRID,
      bbox: box,
      u,
      v,
    };
    if (this.cache.size > 200) this.cache.clear();
    this.cache.set(key, { at: this.now(), grid });
    return grid;
  }
}
