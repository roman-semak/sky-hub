import { normalizeLon, toDeg, toRad } from './angles.js';
import { EARTH_RADIUS_M } from './constants.js';

/**
 * `[west, south, east, north]` in degrees. `west > east` means the box
 * crosses the antimeridian.
 */
export type BBox = readonly [w: number, s: number, e: number, n: number];

export function crossesAntimeridian(bbox: BBox): boolean {
  return bbox[0] > bbox[2];
}

export function bboxContains(bbox: BBox, lat: number, lon: number): boolean {
  const [w, s, e, n] = bbox;
  if (lat < s || lat > n) return false;
  return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;
}

/** Splits an antimeridian-crossing box into at most two ordinary boxes. */
export function splitBBox(bbox: BBox): readonly BBox[] {
  const [w, s, e, n] = bbox;
  return w <= e
    ? [bbox]
    : [
        [w, s, 180, n],
        [-180, s, e, n],
      ];
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  for (const pa of splitBBox(a)) {
    for (const pb of splitBBox(b)) {
      if (pa[0] <= pb[2] && pa[2] >= pb[0] && pa[1] <= pb[3] && pa[3] >= pb[1]) return true;
    }
  }
  return false;
}

/**
 * Bounding box of a circle on the sphere.
 *
 * Latitude extent is exact (δ = r / R); longitude extent uses
 * Δλ = asin(sin δ / cos φ). Near the poles the box widens to all longitudes.
 *
 * @see http://janmatuschek.de/LatitudeLongitudeBoundingCoordinates
 */
export function bboxAroundPoint(lat: number, lon: number, radiusM: number): BBox {
  const δ = radiusM / EARTH_RADIUS_M;
  const φ = toRad(lat);
  const minφ = φ - δ;
  const maxφ = φ + δ;
  const halfPi = Math.PI / 2;
  if (minφ <= -halfPi || maxφ >= halfPi) {
    return [-180, toDeg(Math.max(minφ, -halfPi)), 180, toDeg(Math.min(maxφ, halfPi))];
  }
  const Δλ = toDeg(Math.asin(Math.sin(δ) / Math.cos(φ)));
  if (Δλ >= 180) return [-180, toDeg(minφ), 180, toDeg(maxφ)];
  return [normalizeLon(lon - Δλ), toDeg(minφ), normalizeLon(lon + Δλ), toDeg(maxφ)];
}

/** Width of a box in degrees of longitude, antimeridian-aware. */
export function bboxWidth(bbox: BBox): number {
  const [w, , e] = bbox;
  return w <= e ? e - w : 360 - w + e;
}
