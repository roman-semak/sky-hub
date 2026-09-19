import {
  bboxAroundPoint,
  bboxIntersects,
  bboxWidth,
  encodeGeohash,
  haversineDistance,
  METERS_PER_NM,
  type BBox,
  type CoverageCircle,
} from '@skytrace/geo';

export interface ScheduledCircle {
  readonly circle: CoverageCircle;
  /** Outside the static grid: community networks have little data there. */
  readonly fallback: boolean;
}

export interface SchedulerSnapshot {
  readonly circles: number;
  readonly dynamicCircles: number;
  readonly demandedCircles: number;
  /** Worst staleness among circles someone is looking at, ms. */
  readonly maxDemandedAgeMs: number | null;
  /** Median staleness across the whole grid, ms. */
  readonly medianAgeMs: number | null;
}

/** How much more often a watched circle is refreshed than an unwatched one. */
const DEMAND_WEIGHT = 30;
const MAX_RADIUS_NM = 250;

interface Slot {
  circle: CoverageCircle;
  fallback: boolean;
  dynamic: boolean;
  demanded: boolean;
  lastFetched: number;
  inFlight: boolean;
}

/**
 * Picks the coverage circle to fetch next.
 *
 * Free community APIs allow ~1 request/s in total, far below what refreshing
 * the whole world every 3 s would need. Priority is therefore
 * `staleness × weight`, where circles intersecting any client viewport weigh
 * {@link DEMAND_WEIGHT}× more; see ADR-003.
 */
export class CoverageScheduler {
  private readonly slots = new Map<string, Slot>();

  constructor(grid: readonly CoverageCircle[]) {
    for (const circle of grid) {
      this.slots.set(circle.id, {
        circle,
        fallback: false,
        dynamic: false,
        demanded: false,
        lastFetched: 0,
        inFlight: false,
      });
    }
  }

  /**
   * Replaces the set of viewports clients are looking at. Viewports that no
   * grid circle touches get a dynamic circle (served by fallback providers).
   */
  setDemand(viewports: readonly BBox[]): void {
    const wanted = new Set<string>();
    for (const slot of this.slots.values()) slot.demanded = false;
    for (const vp of viewports) {
      let covered = false;
      for (const slot of this.slots.values()) {
        if (slot.dynamic) continue;
        if (bboxIntersects(slot.circle.bbox, vp)) {
          slot.demanded = true;
          covered = true;
        }
      }
      if (covered) continue;
      const dyn = dynamicCircle(vp);
      wanted.add(dyn.id);
      const existing = this.slots.get(dyn.id);
      if (existing !== undefined) existing.demanded = true;
      else
        this.slots.set(dyn.id, {
          circle: dyn,
          fallback: true,
          dynamic: true,
          demanded: true,
          lastFetched: 0,
          inFlight: false,
        });
    }
    for (const [id, slot] of this.slots) {
      if (slot.dynamic && !wanted.has(id) && !slot.inFlight) this.slots.delete(id);
    }
  }

  /** Highest-priority circle for the given provider class, marked in flight. */
  next(now: number, fallback: boolean): ScheduledCircle | null {
    let best: Slot | null = null;
    let bestScore = -1;
    for (const slot of this.slots.values()) {
      if (slot.inFlight || slot.fallback !== fallback) continue;
      // Unwatched fallback circles are never fetched: OpenSky credits are scarce.
      if (slot.fallback && !slot.demanded) continue;
      const age = now - slot.lastFetched;
      const score = age * (slot.demanded ? DEMAND_WEIGHT : 1);
      if (score > bestScore) {
        bestScore = score;
        best = slot;
      }
    }
    if (best === null) return null;
    best.inFlight = true;
    return { circle: best.circle, fallback: best.fallback };
  }

  complete(id: string, now: number, success: boolean): void {
    const slot = this.slots.get(id);
    if (slot === undefined) return;
    slot.inFlight = false;
    // On failure keep the old timestamp so the circle stays at the front.
    if (success) slot.lastFetched = now;
  }

  snapshot(now: number): SchedulerSnapshot {
    const ages: number[] = [];
    let maxDemanded: number | null = null;
    let demanded = 0;
    let dynamic = 0;
    for (const slot of this.slots.values()) {
      if (slot.dynamic) dynamic++;
      const age = slot.lastFetched === 0 ? null : now - slot.lastFetched;
      if (age !== null && !slot.dynamic) ages.push(age);
      if (slot.demanded) {
        demanded++;
        const a = age ?? Number.POSITIVE_INFINITY;
        maxDemanded = Math.max(maxDemanded ?? 0, a);
      }
    }
    ages.sort((a, b) => a - b);
    const median = ages.length === 0 ? null : (ages[Math.floor(ages.length / 2)] ?? null);
    return {
      circles: this.slots.size,
      dynamicCircles: dynamic,
      demandedCircles: demanded,
      maxDemandedAgeMs: maxDemanded === Number.POSITIVE_INFINITY ? null : maxDemanded,
      medianAgeMs: median,
    };
  }
}

function dynamicCircle(vp: BBox): CoverageCircle {
  const [w, s, e, n] = vp;
  const lat = (s + n) / 2;
  const lon = w <= e ? (w + e) / 2 : (((w + e + 360) / 2 + 180) % 360) - 180;
  const halfDiagM = haversineDistance(lat, lon, n, lon + bboxWidth(vp) / 2);
  const radiusNm = Math.min(MAX_RADIUS_NM, Math.max(10, Math.ceil(halfDiagM / METERS_PER_NM)));
  // Geohash-3 (~150 km) de-duplicates nearby viewports into one circle.
  const id = `dyn-${encodeGeohash(lat, lon, 3)}`;
  return { id, lat, lon, radiusNm, bbox: bboxAroundPoint(lat, lon, radiusNm * METERS_PER_NM) };
}
