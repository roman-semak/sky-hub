import type { Aircraft } from '@skytrace/adsb-types';
import { encodeGeohash } from '@skytrace/geo';
import type { Cluster } from '@skytrace/protocol';

/**
 * Aggregates aircraft by geohash-3 cells (~156 × 156 km) into centroid
 * clusters (SPEC § 4.1, zoom ≤ 3).
 */
export function clusterAircraft(list: Iterable<Aircraft>): Cluster[] {
  const cells = new Map<string, { lat: number; lon: number; count: number }>();
  for (const ac of list) {
    const key = encodeGeohash(ac.lat, ac.lon, 3);
    const c = cells.get(key);
    if (c === undefined) cells.set(key, { lat: ac.lat, lon: ac.lon, count: 1 });
    else {
      c.lat += ac.lat;
      c.lon += ac.lon;
      c.count++;
    }
  }
  return [...cells.values()].map((c) => ({
    lat: c.lat / c.count,
    lon: c.lon / c.count,
    count: c.count,
  }));
}
