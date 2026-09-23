import { bboxContains, simplifyRdp, type BBox } from '@skytrace/geo';
import { encodeAircraftFrame, FrameType, hexToId, type AircraftRecord } from '@skytrace/protocol';
import type { HistoryFix } from './history-codec.js';
import type { HistoryReader } from './history-reader.js';
import { thin } from './history-reader.js';
import type { HistoryWriter } from './history-writer.js';
import type { TrackHistory, TrackPoint } from './track-history.js';

/** SPEC § 6.2 simplification tolerance, degrees. */
export const RDP_EPSILON = 0.0005;
/** SPEC § 6.2: cache track responses for 60 s. */
const CACHE_TTL_MS = 60_000;
/** A gap longer than this splits two flights of the same aircraft. */
const FLIGHT_GAP_MS = 30 * 60_000;

export interface FlightSegment {
  readonly start: number;
  readonly end: number;
  readonly points: number;
  readonly maxAlt: number | null;
  readonly from: { readonly lat: number; readonly lon: number };
  readonly to: { readonly lat: number; readonly lon: number };
}

const toPoint = (f: HistoryFix): TrackPoint => ({
  t: f.ts,
  lat: f.lat,
  lon: f.lon,
  alt: f.alt,
  gs: f.gs,
  track: f.track,
  vr: f.vr,
});

/**
 * Serves history by merging the three places a fix can be: Parquet part
 * files, the writer's unflushed buffer and the in-memory recent track.
 */
export class HistoryService {
  private readonly cache = new Map<string, { at: number; value: unknown }>();

  constructor(
    private readonly reader: HistoryReader | null,
    private readonly writer: HistoryWriter | null,
    private readonly recent: TrackHistory,
    private readonly now: () => number = Date.now,
  ) {}

  /** Full-resolution, de-duplicated track of one aircraft. */
  async rawTrack(hex: string, from: number, to: number): Promise<TrackPoint[]> {
    const stored = this.reader === null ? [] : await this.reader.readTrack(hex, from, to);
    const pending = this.writer?.pending(hex, from, to) ?? [];
    const byTs = new Map<number, TrackPoint>();
    for (const f of [...stored, ...pending]) byTs.set(f.ts, toPoint(f));
    for (const p of this.recent.get(hex, from, to)) byTs.set(p.t, p);
    return [...byTs.values()].sort((a, b) => a.t - b.t);
  }

  /** Simplified track for drawing (RDP, SPEC § 6.2), cached 60 s. */
  async track(
    hex: string,
    from: number,
    to: number,
  ): Promise<{ points: TrackPoint[]; raw: number }> {
    // Round the window so polling clients share cache entries.
    const key = `t:${hex}:${Math.floor(from / 10_000)}:${Math.floor(to / 10_000)}`;
    return this.cached(key, async () => {
      const raw = await this.rawTrack(hex, from, to);
      return { points: simplifyRdp(raw, RDP_EPSILON, (p) => [p.lon, p.lat]), raw: raw.length };
    });
  }

  /** Flights of one aircraft, split at gaps longer than 30 min. */
  async flights(hex: string, from: number, to: number): Promise<FlightSegment[]> {
    return this.cached(
      `f:${hex}:${Math.floor(from / 60_000)}:${Math.floor(to / 60_000)}`,
      async () => segment(await this.rawTrack(hex, from, to)),
    );
  }

  /**
   * Binary playback payload: length-prefixed delta frames, one per second
   * that has fixes (ADR-007). Reuses the stream codec, so the client decodes
   * history exactly like live data.
   */
  async playback(bbox: BBox, from: number, to: number, spacingMs: number): Promise<Uint8Array> {
    const key = `p:${bbox.map((v) => v.toFixed(2)).join(',')}:${Math.floor(from / 10_000)}:${Math.floor(to / 10_000)}:${spacingMs}`;
    return this.cached(key, async () => {
      const stored =
        this.reader === null ? [] : await this.reader.readWindow(bbox, from, to, spacingMs);
      const pending = (this.writer?.pendingInWindow(from, to) ?? []).filter((f) =>
        bboxContains(bbox, f.lat, f.lon),
      );
      return encodePlayback(thin([...stored, ...pending], spacingMs));
    });
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const t = this.now();
    const hit = this.cache.get(key);
    if (hit !== undefined && t - hit.at < CACHE_TTL_MS) return hit.value as T;
    const value = await load();
    if (this.cache.size > 500) this.cache.clear();
    this.cache.set(key, { at: t, value });
    return value;
  }
}

function recordOf(f: HistoryFix): AircraftRecord {
  const { icao, nonIcao } = hexToId(f.hex);
  return {
    icao,
    nonIcao,
    lat: f.lat,
    lon: f.lon,
    alt: f.alt,
    gs: f.gs,
    track: f.track,
    baroRate: f.vr,
    squawk: null,
    onGround: f.alt === 0,
    mlat: false,
    tisb: false,
    military: false,
    special: false,
    emergency: 'none',
    category: null,
    age: 0,
  };
}

/** `[u32 length][frame]…` — frames grouped by whole second, oldest first. */
export function encodePlayback(fixes: readonly HistoryFix[]): Uint8Array {
  const frames: ArrayBuffer[] = [];
  let i = 0;
  while (i < fixes.length) {
    const first = fixes[i];
    if (first === undefined) break;
    const sec = Math.floor(first.ts / 1000);
    const group: AircraftRecord[] = [];
    while (
      i < fixes.length &&
      Math.floor((fixes[i]?.ts ?? 0) / 1000) === sec &&
      group.length < 0xffff
    ) {
      const f = fixes[i];
      if (f !== undefined) group.push(recordOf(f));
      i++;
    }
    frames.push(encodeAircraftFrame(FrameType.Delta, sec, group));
  }
  const total = frames.reduce((n, f) => n + 4 + f.byteLength, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let o = 0;
  for (const f of frames) {
    view.setUint32(o, f.byteLength);
    out.set(new Uint8Array(f), o + 4);
    o += 4 + f.byteLength;
  }
  return out;
}

export function segment(points: readonly TrackPoint[]): FlightSegment[] {
  const out: FlightSegment[] = [];
  let cur: TrackPoint[] = [];
  const close = (): void => {
    const first = cur[0];
    const last = cur.at(-1);
    if (first === undefined || last === undefined) return;
    const alts = cur.map((p) => p.alt).filter((a): a is number => a !== null);
    out.push({
      start: first.t,
      end: last.t,
      points: cur.length,
      maxAlt: alts.length === 0 ? null : Math.max(...alts),
      from: { lat: first.lat, lon: first.lon },
      to: { lat: last.lat, lon: last.lon },
    });
  };
  for (const p of points) {
    const prev = cur.at(-1);
    if (prev !== undefined && p.t - prev.t > FLIGHT_GAP_MS) {
      close();
      cur = [];
    }
    cur.push(p);
  }
  close();
  return out.reverse();
}
