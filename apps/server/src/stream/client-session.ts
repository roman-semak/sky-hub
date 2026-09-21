import {
  isEmptyFilter,
  matchesFilter,
  type Aircraft,
  type CountryResolver,
  type FilterSpec,
} from '@skytrace/adsb-types';
import type { BBox } from '@skytrace/geo';
import {
  assembleAircraftFrame,
  encodeClusters,
  encodeRemovals,
  FrameType,
  hexToId,
  MAX_COUNT,
} from '@skytrace/protocol';
import type { SpatialIndex } from '../state/spatial-index.js';
import type { StoredAircraft } from '../state/state-store.js';
import { clusterAircraft } from './clusters.js';
import { TOP_N, zoomPolicy, type ZoomPolicy } from './zoom-policy.js';

export interface WorldView {
  readonly index: SpatialIndex;
  /** Unix ms of this publish. */
  readonly now: number;
}

export interface Subscription {
  readonly bbox: BBox;
  readonly zoom: number;
}

export interface PendingFrames {
  readonly frames: readonly ArrayBuffer[];
  commit(): void;
}

const EMPTY: PendingFrames = { frames: [], commit: () => undefined };
const MAX_WATCHED = 20;

const isImportant = (ac: Aircraft): boolean => ac.emergency !== 'none' || ac.military;

/**
 * Per-connection stream state: what the client asked for and what it has
 * already received, so each tick sends only changes (SPEC § 4.3).
 */
export class ClientSession {
  private sub: Subscription | null = null;
  private policy: ZoomPolicy = zoomPolicy(0);
  private filter: FilterSpec = {};
  private filterActive = false;
  private readonly watched = new Set<string>();
  /** hex → revision last sent. */
  private sent = new Map<string, number>();
  private needsSnapshot = true;
  private lastFrameAt = 0;
  private clustersSent = false;

  constructor(private readonly countryOf?: CountryResolver) {}

  get subscription(): Subscription | null {
    return this.sub;
  }

  get inView(): number {
    return this.sent.size;
  }

  subscribe(sub: Subscription): void {
    this.sub = sub;
    this.policy = zoomPolicy(sub.zoom);
    // A new viewport answers immediately instead of waiting for the interval.
    this.lastFrameAt = 0;
  }

  setFilter(filter: FilterSpec): void {
    this.filter = filter;
    this.filterActive = !isEmptyFilter(filter);
    this.lastFrameAt = 0;
  }

  watch(hex: string): boolean {
    if (this.watched.size >= MAX_WATCHED && !this.watched.has(hex)) return false;
    this.watched.add(hex);
    this.lastFrameAt = 0;
    return true;
  }

  unwatch(hex: string): void {
    this.watched.delete(hex);
  }

  /** Whether the client's interval has elapsed. */
  isDue(now: number): boolean {
    return this.sub !== null && now - this.lastFrameAt >= this.policy.intervalMs - 50;
  }

  /**
   * Frames to send for this tick. Call {@link PendingFrames.commit} only once
   * they are handed to the socket, so a skipped tick (backpressure) is covered
   * by the next delta.
   */
  buildFrames(view: WorldView, removedGlobally: readonly string[]): PendingFrames {
    const sub = this.sub;
    if (sub === null) return EMPTY;
    const ts = Math.floor(view.now / 1000);
    const snapshot = this.needsSnapshot;
    const nextSent = new Map<string, number>();
    const changed: StoredAircraft[] = [];
    const take = (item: StoredAircraft): void => {
      const hex = item.ac.hex;
      if (nextSent.has(hex)) return;
      nextSent.set(hex, item.rev);
      if (snapshot || this.sent.get(hex) !== item.rev) changed.push(item);
    };

    const inBox = view.index.query(sub.bbox);
    if (this.policy.mode === 'all') {
      for (const item of inBox) if (this.passes(item.ac)) take(item);
    } else {
      const rest: StoredAircraft[] = [];
      for (const item of inBox) {
        if (!this.passes(item.ac)) continue;
        if (isImportant(item.ac)) take(item);
        else if (this.policy.mode === 'top') rest.push(item);
      }
      rest.sort((a, b) => (b.ac.altBaro ?? -1) - (a.ac.altBaro ?? -1));
      for (let i = 0; i < Math.min(TOP_N, rest.length); i++) {
        const item = rest[i];
        if (item !== undefined) take(item);
      }
    }
    // Watched aircraft are always streamed, even outside the viewport.
    for (const hex of this.watched) {
      const item = view.index.get(hex);
      if (item !== undefined) take(item);
    }

    const frames: ArrayBuffer[] = [];
    if (!snapshot) {
      const gone: string[] = [];
      for (const hex of this.sent.keys()) if (!nextSent.has(hex)) gone.push(hex);
      for (const hex of removedGlobally)
        if (this.sent.has(hex) && !nextSent.has(hex) && !gone.includes(hex)) gone.push(hex);
      if (gone.length > 0)
        frames.push(...chunk(gone, (part) => encodeRemovals(ts, part.map(hexToId))));
    }
    if (changed.length > 0 || snapshot) {
      const type = snapshot ? FrameType.Snapshot : FrameType.Delta;
      frames.push(...chunk(changed, (part) => assembleAircraftFrame(type, ts, part), true));
    }
    if (this.policy.mode === 'clusters') {
      const pool = inBox.map((s) => s.ac).filter((ac) => this.passes(ac));
      frames.push(encodeClusters(ts, clusterAircraft(pool).slice(0, MAX_COUNT)));
    } else if (this.clustersSent) {
      // Leaving cluster mode: an empty cluster frame clears the client layer.
      frames.push(encodeClusters(ts, []));
    }

    return {
      frames,
      commit: () => {
        this.sent = nextSent;
        this.needsSnapshot = false;
        this.lastFrameAt = view.now;
        this.clustersSent = this.policy.mode === 'clusters';
      },
    };
  }

  /** How many aircraft in the current viewport a filter would let through. */
  countMatching(view: WorldView, f: FilterSpec): number {
    const sub = this.sub;
    if (sub === null) return 0;
    const all = isEmptyFilter(f);
    let n = 0;
    for (const item of view.index.query(sub.bbox)) {
      if (all || matchesFilter(item.ac, f, this.countryOf)) n++;
    }
    return n;
  }

  private passes(ac: Aircraft): boolean {
    return !this.filterActive || matchesFilter(ac, this.filter, this.countryOf);
  }
}

function chunk<T>(
  items: readonly T[],
  encode: (part: readonly T[]) => ArrayBuffer,
  allowEmpty = false,
): ArrayBuffer[] {
  if (items.length === 0) return allowEmpty ? [encode([])] : [];
  const out: ArrayBuffer[] = [];
  for (let i = 0; i < items.length; i += MAX_COUNT) out.push(encode(items.slice(i, i + MAX_COUNT)));
  return out;
}
