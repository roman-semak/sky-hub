import { bboxAroundPoint, type BBox } from './bbox.js';
import { METERS_PER_NM } from './constants.js';

export interface CoverageCircle {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly radiusNm: number;
  readonly bbox: BBox;
}

interface Region {
  readonly name: string;
  /** `[west, south, east, north]`. */
  readonly box: BBox;
}

/**
 * Regions where community ADS-B networks actually have receivers. Oceans and
 * most of Africa/Siberia are deliberately absent — there is nothing to fetch
 * there without satellite ADS-B (SPEC § 1.6).
 */
const REGIONS: readonly Region[] = [
  { name: 'eu', box: [-10, 36, 30, 60] },
  { name: 'us', box: [-124, 26, -70, 48] },
  { name: 'ca', box: [-123, 48, -73, 53] },
  { name: 'jp', box: [130, 31, 141, 42] },
  { name: 'au', box: [115, -38, 153, -27] },
  { name: 'br', box: [-50, -30, -40, -20] },
  { name: 'me', box: [34, 24, 56, 33] },
  { name: 'in', box: [72, 12, 88, 29] },
  { name: 'sea', box: [100, 0, 121, 23] },
];

/**
 * Covers the {@link REGIONS} with circles of `radiusNm` laid out on a square
 * lattice with spacing `radius · √2`, which leaves no gaps between circles.
 * Longitude spacing is widened by 1 / cos φ so circles stay equidistant on the
 * ground.
 */
export function worldCoverageGrid(radiusNm = 250): CoverageCircle[] {
  const radiusM = radiusNm * METERS_PER_NM;
  const stepDeg = ((radiusM * Math.SQRT2) / 111_320) * 0.98;
  const circles: CoverageCircle[] = [];
  for (const region of REGIONS) {
    const [w, s, e, n] = region.box;
    let row = 0;
    for (let lat = s + stepDeg / 2; lat < n + stepDeg / 2; lat += stepDeg, row++) {
      const lonStep = stepDeg / Math.cos((Math.min(Math.abs(lat), 80) * Math.PI) / 180);
      let col = 0;
      for (let lon = w + lonStep / 2; lon < e + lonStep / 2; lon += lonStep, col++) {
        const rLat = Math.round(lat * 100) / 100;
        const rLon = Math.round(lon * 100) / 100;
        circles.push({
          id: `${region.name}-${row}-${col}`,
          lat: rLat,
          lon: rLon,
          radiusNm,
          bbox: bboxAroundPoint(rLat, rLon, radiusM),
        });
      }
    }
  }
  return circles;
}
