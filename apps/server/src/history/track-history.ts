import type { Aircraft } from '@skytrace/adsb-types';

/** One position of a recorded track. */
export interface TrackPoint {
  /** Unix ms. */
  readonly t: number;
  readonly lat: number;
  readonly lon: number;
  readonly alt: number | null;
  readonly gs: number | null;
  readonly track: number | null;
  readonly vr: number | null;
}

export interface TrackHistoryOptions {
  /** Keep this much recent history per aircraft in memory, ms. */
  readonly windowMs: number;
  /** Minimum spacing between stored points, ms. */
  readonly minSpacingMs: number;
}

export const DEFAULT_TRACK_OPTIONS: TrackHistoryOptions = {
  windowMs: 30 * 60_000,
  minSpacingMs: 10_000,
};

/**
 * Short in-memory track per aircraft for the detail panel charts and the
 * trail. Long-term history is the Parquet store (phase 5).
 *
 * Points are sampled at most every `minSpacingMs`, so the worst case is
 * windowMs / minSpacingMs points per aircraft (180 by default).
 */
export class TrackHistory {
  private readonly tracks = new Map<string, TrackPoint[]>();

  constructor(private readonly opts: TrackHistoryOptions = DEFAULT_TRACK_OPTIONS) {}

  record(ac: Aircraft): void {
    let list = this.tracks.get(ac.hex);
    if (list === undefined) {
      list = [];
      this.tracks.set(ac.hex, list);
    }
    const last = list.at(-1);
    if (last !== undefined && ac.posTime - last.t < this.opts.minSpacingMs) return;
    list.push({
      t: ac.posTime,
      lat: ac.lat,
      lon: ac.lon,
      alt: ac.onGround ? 0 : ac.altBaro,
      gs: ac.gs,
      track: ac.track,
      vr: ac.baroRate,
    });
    const cutoff = ac.posTime - this.opts.windowMs;
    let drop = 0;
    while (drop < list.length && (list[drop]?.t ?? Infinity) < cutoff) drop++;
    if (drop > 0) list.splice(0, drop);
  }

  get(hex: string, from = 0, to = Number.POSITIVE_INFINITY): TrackPoint[] {
    return (this.tracks.get(hex) ?? []).filter((p) => p.t >= from && p.t <= to);
  }

  forget(hexes: Iterable<string>): void {
    for (const hex of hexes) this.tracks.delete(hex);
  }

  get aircraftCount(): number {
    return this.tracks.size;
  }
}
