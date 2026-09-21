/** Map view encoded in the URL: `/?lat=38.77&lon=-9.13&z=9&sel=4951ab` (SPEC § 5.4). */
export interface UrlMapState {
  readonly lat: number;
  readonly lon: number;
  readonly zoom: number;
  readonly selected: string | null;
}

export const DEFAULT_MAP_STATE: UrlMapState = { lat: 50, lon: 10, zoom: 5, selected: null };

const HEX = /^~?[0-9a-f]{6}$/;

function num(v: string | null, min: number, max: number): number | null {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Parses query params, falling back per field to `fallback` when absent or invalid. */
export function parseMapState(
  params: URLSearchParams,
  fallback: UrlMapState = DEFAULT_MAP_STATE,
): UrlMapState {
  const sel = params.get('sel')?.toLowerCase() ?? null;
  return {
    lat: num(params.get('lat'), -85, 85) ?? fallback.lat,
    lon: num(params.get('lon'), -180, 180) ?? fallback.lon,
    zoom: num(params.get('z'), 0, 22) ?? fallback.zoom,
    selected: sel !== null && HEX.test(sel) ? sel : fallback.selected,
  };
}

/** Serializes with precision matched to the zoom so URLs stay short. */
export function serializeMapState(state: UrlMapState): Record<string, string | null> {
  const digits = Math.min(6, Math.max(2, Math.ceil(state.zoom / 3) + 1));
  return {
    lat: state.lat.toFixed(digits),
    lon: state.lon.toFixed(digits),
    z: (Math.round(state.zoom * 100) / 100).toString(),
    sel: state.selected,
  };
}
