import type { Aircraft } from '@skytrace/adsb-types';
import type { EmergencyAlert } from '@skytrace/protocol';
import type { SpatialIndex } from '../state/spatial-index.js';

/** An alert stays "current" while the aircraft keeps squawking, plus this grace period. */
const FORGET_AFTER_MS = 15 * 60_000;

const toAlert = (ac: Aircraft): EmergencyAlert => ({
  hex: ac.hex,
  callsign: ac.callsign,
  squawk: ac.squawk,
  kind: ac.emergency,
  lat: ac.lat,
  lon: ac.lon,
  military: ac.military,
  at: ac.posTime,
});

/**
 * Watches every tracked aircraft — not just the viewport — for emergency
 * squawks (7500 hijack, 7600 radio failure, 7700 general) and reports the
 * ones that are new since the last tick (SPEC phase 8).
 */
export class EmergencyWatch {
  private readonly seen = new Map<string, { kind: string; at: number }>();

  /** @returns alerts raised since the previous call */
  scan(index: SpatialIndex, now: number): EmergencyAlert[] {
    const fresh: EmergencyAlert[] = [];
    for (const { ac } of index.all()) {
      if (ac.emergency === 'none') continue;
      const previous = this.seen.get(ac.hex);
      this.seen.set(ac.hex, { kind: ac.emergency, at: now });
      // A changed code (7600 → 7700) is a new alert worth showing again.
      if (previous?.kind !== ac.emergency) fresh.push(toAlert(ac));
    }
    for (const [hex, entry] of this.seen) {
      if (now - entry.at > FORGET_AFTER_MS) this.seen.delete(hex);
    }
    return fresh;
  }

  /** Everything currently squawking an emergency, for late joiners. */
  current(index: SpatialIndex): EmergencyAlert[] {
    return index
      .all()
      .filter(({ ac }) => ac.emergency !== 'none')
      .map(({ ac }) => toAlert(ac));
  }

  get size(): number {
    return this.seen.size;
  }
}
