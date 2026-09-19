import type { Aircraft } from '@skytrace/adsb-types';
import { SpatialIndex } from '../src/state/spatial-index.js';
import { StateStore } from '../src/state/state-store.js';
import { makeAircraft, T0 } from './fixtures.js';

/** A tiny mutable world for stream tests. */
export class World {
  readonly store = new StateStore();
  now = T0;
  index = SpatialIndex.build([]);

  put(...list: Partial<Aircraft>[]): this {
    this.store.upsertMany(
      list.map((o) => makeAircraft({ posTime: this.now, seenTime: this.now, ...o })),
    );
    return this;
  }

  rebuild(): { index: SpatialIndex; now: number } {
    this.index = SpatialIndex.build(this.store.values());
    return { index: this.index, now: this.now };
  }

  /** `n` aircraft on a grid around Lisbon, hex `a00000 + i`. */
  static grid(n: number, now = T0): Partial<Aircraft>[] {
    return Array.from({ length: n }, (_, i) => ({
      hex: (0xa00000 + i).toString(16),
      lat: 38 + (i % 30) * 0.03,
      lon: -10 + Math.floor(i / 30) * 0.03,
      altBaro: 1000 + i * 10,
      posTime: now,
      seenTime: now,
    }));
  }
}
