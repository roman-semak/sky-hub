import { applyFix, createTrackState, type Fix } from '@skytrace/geo';
import {
  FrameType,
  idToHex,
  type AircraftRecord,
  type Cluster,
  type Frame,
} from '@skytrace/protocol';
import { silhouetteFor } from '../../map/layers/silhouettes';
import type { LiveAircraft } from './live-aircraft';

/** Client removes aircraft whose position is older than this (SPEC § 5.1). */
export const CLIENT_REMOVE_AFTER_MS = 120_000;

/**
 * Applies decoded stream frames to the client's aircraft map.
 *
 * Deliberately not reactive: the map holds thousands of entries mutated on
 * every frame and read by the 60 fps render loop. UI code reads the
 * `version` counter or derived signals maintained by the stream service.
 */
export class LiveRegistry {
  readonly aircraft = new Map<string, LiveAircraft>();
  clusters: readonly Cluster[] = [];
  /** Bumped whenever membership or icon choice changes. */
  version = 0;
  private clockOffsetMs = 0;

  /** Aligns server time (from `hello`) with the local clock. */
  syncClock(serverMs: number, localMs: number): void {
    this.clockOffsetMs = localMs - serverMs;
  }

  apply(frame: Frame, localNow: number): void {
    switch (frame.type) {
      case FrameType.Snapshot: {
        const keep = new Set<string>();
        for (const r of frame.records) keep.add(this.upsert(r, frame.timestamp, localNow));
        for (const hex of this.aircraft.keys()) {
          if (!keep.has(hex)) this.aircraft.delete(hex);
        }
        this.version++;
        break;
      }
      case FrameType.Delta:
        for (const r of frame.records) this.upsert(r, frame.timestamp, localNow);
        break;
      case FrameType.Removals:
        for (const id of frame.removals) {
          if (this.aircraft.delete(idToHex(id.icao, id.nonIcao))) this.version++;
        }
        break;
      case FrameType.Clusters:
        this.clusters = frame.clusters;
        this.version++;
        break;
    }
  }

  /** Drops aircraft whose last fix is too old. @returns number removed */
  prune(localNow: number, maxAgeMs = CLIENT_REMOVE_AFTER_MS): number {
    let removed = 0;
    for (const [hex, ac] of this.aircraft) {
      if (localNow - ac.fixTime > maxAgeMs) {
        this.aircraft.delete(hex);
        removed++;
      }
    }
    if (removed > 0) this.version++;
    return removed;
  }

  clear(): void {
    this.aircraft.clear();
    this.clusters = [];
    this.version++;
  }

  private upsert(r: AircraftRecord, frameTsSec: number, localNow: number): string {
    const t = Math.min(localNow, frameTsSec * 1000 - r.age * 1000 + this.clockOffsetMs);
    return this.upsertAt(r, t, localNow);
  }

  /**
   * Applies one record with an explicit fix time. Playback uses this with a
   * virtual clock, so dead reckoning and blending run in replay time.
   */
  upsertAt(r: AircraftRecord, t: number, localNow: number): string {
    const hex = idToHex(r.icao, r.nonIcao);
    const fix: Fix = {
      lat: r.lat,
      lon: r.lon,
      track: r.track,
      gs: r.onGround && (r.gs ?? 0) < 1 ? 0 : r.gs,
      t,
    };
    const silhouette = silhouetteFor(r.category, r.military);
    const existing = this.aircraft.get(hex);
    if (existing === undefined) {
      this.aircraft.set(hex, {
        hex,
        record: r,
        track: createTrackState(fix),
        silhouette,
        fixTime: t,
      });
      this.version++;
      return hex;
    }
    existing.record = r;
    existing.track = applyFix(existing.track, fix, localNow);
    existing.fixTime = existing.track.current.t;
    if (existing.silhouette !== silhouette) {
      existing.silhouette = silhouette;
      this.version++;
    }
    return hex;
  }
}
