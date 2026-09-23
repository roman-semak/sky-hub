/** Web Mercator: the whole 360° of longitude spans 256·2^zoom pixels. */
const TILE_SIZE = 256;

/** How much wider than one grid cell the heat kernel is drawn. */
const SPREAD = 3;

const MIN_PX = 30;
const MAX_PX = 140;

/**
 * Blur radius for the density heatmap, in screen pixels.
 *
 * The data is binned, so a kernel narrower than the grid step renders as a
 * dot pattern instead of a field. The radius therefore tracks the on-screen
 * size of one cell, clamped so the layer stays readable at both extremes.
 *
 * @param cellDeg grid step in degrees of longitude
 * @param zoom MapLibre zoom level
 * @see https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Resolution_and_Scale
 */
export function heatRadiusPixels(cellDeg: number, zoom: number): number {
  const cellPx = (cellDeg * TILE_SIZE * 2 ** zoom) / 360;
  return Math.min(MAX_PX, Math.max(MIN_PX, cellPx * SPREAD));
}
