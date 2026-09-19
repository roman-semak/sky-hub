import type { Aircraft } from '@skytrace/adsb-types';

export interface StoredAircraft {
  readonly ac: Aircraft;
  /** Global revision at the time of the last accepted update. */
  readonly rev: number;
}

/** Newer positions within this window are considered simultaneous, ms. */
const SAME_FIX_WINDOW_MS = 1000;

/**
 * Current state of every aircraft, keyed by hex.
 *
 * Deduplication (SPEC § Phase 1): overlapping circles and several providers
 * report the same aircraft. A report replaces the stored one if its position
 * is clearly newer; for practically simultaneous positions the report with
 * more received `messages` (the better-covered receiver) wins.
 */
export class StateStore {
  private readonly map = new Map<string, StoredAircraft>();
  private revision = 0;
  private peak = 0;

  get size(): number {
    return this.map.size;
  }

  get peakSize(): number {
    return this.peak;
  }

  get currentRevision(): number {
    return this.revision;
  }

  /** @returns number of accepted updates */
  upsertMany(list: readonly Aircraft[]): number {
    let accepted = 0;
    for (const ac of list) {
      if (this.upsert(ac)) accepted++;
    }
    if (this.map.size > this.peak) this.peak = this.map.size;
    return accepted;
  }

  upsert(ac: Aircraft): boolean {
    const prev = this.map.get(ac.hex);
    if (prev !== undefined && !shouldReplace(prev.ac, ac)) return false;
    this.map.set(ac.hex, { ac: mergeStatic(prev?.ac, ac), rev: ++this.revision });
    return true;
  }

  get(hex: string): StoredAircraft | undefined {
    return this.map.get(hex);
  }

  /** Removes aircraft not heard from for longer than `maxAgeMs`. */
  evictStale(now: number, maxAgeMs: number): string[] {
    const removed: string[] = [];
    for (const [hex, entry] of this.map) {
      if (now - entry.ac.seenTime > maxAgeMs) {
        this.map.delete(hex);
        removed.push(hex);
      }
    }
    return removed;
  }

  values(): IterableIterator<StoredAircraft> {
    return this.map.values();
  }
}

function shouldReplace(prev: Aircraft, next: Aircraft): boolean {
  const dt = next.posTime - prev.posTime;
  if (dt > SAME_FIX_WINDOW_MS) return true;
  if (dt < -SAME_FIX_WINDOW_MS) return false;
  return next.messages >= prev.messages;
}

// OpenSky has no registration/type; keep what a richer provider told us.
function mergeStatic(prev: Aircraft | undefined, next: Aircraft): Aircraft {
  if (prev === undefined) return next;
  if (next.registration !== null && next.typeCode !== null && next.category !== null) return next;
  return {
    ...next,
    registration: next.registration ?? prev.registration,
    typeCode: next.typeCode ?? prev.typeCode,
    category: next.category ?? prev.category,
    callsign: next.callsign ?? prev.callsign,
  };
}
