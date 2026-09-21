import { destinationPoint, KNOTS_TO_MPS, normalizeBearing } from '@skytrace/geo';
import { FrameType, type AircraftRecord, type Frame } from '@skytrace/protocol';

const CATEGORIES = ['A1', 'A2', 'A3', 'A3', 'A3', 'A5', 'A7', 'B1', 'A6', null] as const;

/** Deterministic PRNG (mulberry32) so benchmark runs are comparable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates `count` aircraft around a point and advances them once per
 * `tick`. Used by the FPS benchmark (`?synthetic=5000`) and for demos without
 * a server. Produces the same {@link Frame} objects the decoder does.
 */
export class SyntheticFeed {
  private readonly records: AircraftRecord[] = [];
  private readonly rand: () => number;
  private first = true;

  constructor(count: number, centerLat: number, centerLon: number, spreadDeg = 6, seed = 1) {
    this.rand = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const r = this.rand;
      this.records.push({
        icao: 0x800000 + i,
        nonIcao: false,
        lat: centerLat + (r() - 0.5) * spreadDeg,
        lon: centerLon + (r() - 0.5) * spreadDeg * 1.6,
        alt: Math.round(r() * 42000),
        gs: 120 + r() * 380,
        track: r() * 360,
        baroRate: Math.round((r() - 0.5) * 3000),
        squawk: i % 997 === 0 ? '7700' : '1000',
        onGround: false,
        mlat: false,
        tisb: false,
        military: i % 150 === 0,
        special: false,
        emergency: i % 997 === 0 ? 'general' : 'none',
        category: CATEGORIES[i % CATEGORIES.length] ?? null,
        age: 0,
      });
    }
  }

  /** Advances every aircraft by `dtSec` and returns the next frame. */
  tick(nowMs: number, dtSec: number): Frame {
    const ts = Math.floor(nowMs / 1000);
    if (!this.first) {
      for (let i = 0; i < this.records.length; i++) {
        const r = this.records[i];
        if (r === undefined) continue;
        const track = normalizeBearing((r.track ?? 0) + (this.rand() - 0.5) * 4);
        const p = destinationPoint(r.lat, r.lon, track, (r.gs ?? 0) * KNOTS_TO_MPS * dtSec);
        this.records[i] = { ...r, lat: p.lat, lon: p.lon, track };
      }
    }
    const type = this.first ? FrameType.Snapshot : FrameType.Delta;
    this.first = false;
    return { type, timestamp: ts, records: this.records.map((r) => ({ ...r, age: 0 })) };
  }
}
