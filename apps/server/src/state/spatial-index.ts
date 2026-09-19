import type { Aircraft } from '@skytrace/adsb-types';
import { splitBBox, type BBox } from '@skytrace/geo';
import Flatbush from 'flatbush';
import type { StoredAircraft } from './state-store.js';

/**
 * Immutable static R-tree over aircraft positions. Rebuilt from scratch once
 * per second: packing 25k points takes a few ms, far cheaper than keeping a
 * dynamic tree in sync with every update.
 */
export class SpatialIndex {
  private readonly tree: Flatbush | null;
  private readonly items: StoredAircraft[];
  private readonly byHex: Map<string, StoredAircraft>;

  private constructor(items: StoredAircraft[]) {
    this.items = items;
    this.byHex = new Map(items.map((i) => [i.ac.hex, i]));
    if (items.length === 0) {
      this.tree = null;
      return;
    }
    const tree = new Flatbush(items.length);
    for (const { ac } of items) tree.add(ac.lon, ac.lat, ac.lon, ac.lat);
    tree.finish();
    this.tree = tree;
  }

  static build(source: Iterable<StoredAircraft>): SpatialIndex {
    return new SpatialIndex([...source]);
  }

  /** Snapshot entry for one aircraft, consistent with {@link query}. */
  get(hex: string): StoredAircraft | undefined {
    return this.byHex.get(hex);
  }

  get size(): number {
    return this.items.length;
  }

  query(bbox: BBox): StoredAircraft[] {
    const tree = this.tree;
    if (tree === null) return [];
    const out: StoredAircraft[] = [];
    for (const [w, s, e, n] of splitBBox(bbox)) {
      for (const i of tree.search(w, s, e, n)) {
        const item = this.items[i];
        if (item !== undefined) out.push(item);
      }
    }
    return out;
  }

  /** Aircraft nearest to a point, closest first. */
  nearest(lat: number, lon: number, maxResults: number): Aircraft[] {
    const tree = this.tree;
    if (tree === null) return [];
    return tree
      .neighbors(lon, lat, maxResults)
      .map((i) => this.items[i]?.ac)
      .filter((ac): ac is Aircraft => ac !== undefined);
  }

  all(): readonly StoredAircraft[] {
    return this.items;
  }
}
