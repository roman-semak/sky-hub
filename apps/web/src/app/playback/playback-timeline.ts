import { decodeFrame, FrameType, idToHex, type AircraftRecord } from '@skytrace/protocol';
import type { LiveRegistry } from '../core/live/live-registry';

interface Track {
  readonly times: number[];
  readonly records: AircraftRecord[];
  /** Index of the next fix not yet applied. */
  next: number;
}

/**
 * Splits the `/api/history` payload — `[u32 length][frame]…` (ADR-007) —
 * into decoded frames. Truncated or corrupt frames end the parse.
 */
export function parsePlaybackPayload(
  buffer: ArrayBuffer,
): { ts: number; records: AircraftRecord[] }[] {
  const view = new DataView(buffer);
  const out: { ts: number; records: AircraftRecord[] }[] = [];
  let o = 0;
  while (o + 4 <= buffer.byteLength) {
    const len = view.getUint32(o);
    if (o + 4 + len > buffer.byteLength) break;
    try {
      const frame = decodeFrame(new Uint8Array(buffer, o + 4, len));
      if (frame.type === FrameType.Delta || frame.type === FrameType.Snapshot) {
        out.push({ ts: frame.timestamp * 1000, records: frame.records });
      }
    } catch {
      break;
    }
    o += 4 + len;
  }
  return out;
}

/**
 * Replays recorded fixes into a {@link LiveRegistry} on a virtual clock.
 * Moving forward only applies fixes crossed since the last step (O(new
 * fixes)); seeking backwards rebuilds the registry from the last fix of each
 * aircraft before the target time.
 */
export class PlaybackTimeline {
  private readonly tracks = new Map<string, Track>();
  readonly start: number;
  readonly end: number;
  readonly fixCount: number;
  private cursor: number;

  constructor(frames: readonly { ts: number; records: readonly AircraftRecord[] }[]) {
    let start = Infinity;
    let end = -Infinity;
    let count = 0;
    for (const f of frames) {
      start = Math.min(start, f.ts);
      end = Math.max(end, f.ts);
      for (const r of f.records) {
        const hex = idToHex(r.icao, r.nonIcao);
        let t = this.tracks.get(hex);
        if (t === undefined) {
          t = { times: [], records: [], next: 0 };
          this.tracks.set(hex, t);
        }
        t.times.push(f.ts);
        t.records.push(r);
        count++;
      }
    }
    for (const t of this.tracks.values()) {
      // Frames arrive sorted, but guard against a server that does not.
      const order = t.times.map((_, i) => i).sort((a, b) => (t.times[a] ?? 0) - (t.times[b] ?? 0));
      const times = order.map((i) => t.times[i] ?? 0);
      const records = order
        .map((i) => t.records[i])
        .filter((r): r is AircraftRecord => r !== undefined);
      t.times.splice(0, t.times.length, ...times);
      t.records.splice(0, t.records.length, ...records);
    }
    this.start = Number.isFinite(start) ? start : 0;
    this.end = Number.isFinite(end) ? end : 0;
    this.fixCount = count;
    this.cursor = this.start - 1;
  }

  get aircraftCount(): number {
    return this.tracks.size;
  }

  /** Brings `registry` to virtual time `t`. */
  advanceTo(registry: LiveRegistry, t: number): void {
    if (t < this.cursor) {
      this.seek(registry, t);
      return;
    }
    for (const track of this.tracks.values()) {
      while (track.next < track.times.length && (track.times[track.next] ?? Infinity) <= t) {
        const rec = track.records[track.next];
        const ts = track.times[track.next];
        if (rec !== undefined && ts !== undefined) registry.upsertAt(rec, ts, t);
        track.next++;
      }
    }
    this.cursor = t;
    registry.prune(t);
  }

  /** Rebuilds state at `t` from scratch (scrubbing backwards). */
  seek(registry: LiveRegistry, t: number): void {
    registry.clear();
    for (const track of this.tracks.values()) {
      const idx = upperBound(track.times, t) - 1;
      track.next = idx + 1;
      // Two fixes let dead reckoning start with a proper heading and blend.
      for (const i of [idx - 1, idx]) {
        const rec = track.records[i];
        const ts = track.times[i];
        if (rec !== undefined && ts !== undefined) registry.upsertAt(rec, ts, t);
      }
    }
    this.cursor = t;
    registry.prune(t);
  }
}

/** First index with `arr[i] > value` in a sorted array. */
function upperBound(arr: readonly number[], value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((arr[mid] ?? Infinity) <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
