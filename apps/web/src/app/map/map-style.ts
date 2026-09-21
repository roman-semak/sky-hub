import type { StyleSpecification } from 'maplibre-gl';

export type MapTheme = 'dark' | 'light';

/** CARTO basemap GL styles: free, keyless (SPEC § 3). */
const STYLE_URL: Readonly<Record<MapTheme, string>> = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
};

interface Palette {
  readonly land: string;
  readonly water: string;
  readonly line: string;
  readonly road: string;
}

// Nocturne map colours from the design handoff (map land / stroke / graticule).
const PALETTE: Readonly<Record<MapTheme, Palette>> = {
  dark: {
    land: '#1a1e2e',
    water: '#10121d',
    line: 'rgba(233,233,237,0.16)',
    road: 'rgba(233,233,237,0.05)',
  },
  light: {
    land: '#e9ebf2',
    water: '#d5d9e6',
    line: 'rgba(26,28,38,0.18)',
    road: 'rgba(26,28,38,0.06)',
  },
};

type LayerLike = StyleSpecification['layers'][number];

function recolor(layer: LayerLike, p: Palette): LayerLike {
  const id = layer.id;
  if (layer.type === 'background') return { ...layer, paint: { 'background-color': p.land } };
  if (layer.type === 'fill') {
    if (id.includes('water')) return { ...layer, paint: { ...layer.paint, 'fill-color': p.water } };
    return { ...layer, paint: { ...layer.paint, 'fill-color': p.land, 'fill-opacity': 0.4 } };
  }
  if (layer.type === 'line') {
    if (/boundary|admin/.test(id))
      return { ...layer, paint: { ...layer.paint, 'line-color': p.line } };
    if (/water|river/.test(id))
      return { ...layer, paint: { ...layer.paint, 'line-color': p.water } };
    return { ...layer, paint: { ...layer.paint, 'line-color': p.road } };
  }
  return layer;
}

/** Loads the CARTO style and repaints it with the Nocturne palette. */
export async function loadMapStyle(
  theme: MapTheme,
  fetchFn: typeof fetch = fetch,
): Promise<StyleSpecification> {
  const res = await fetchFn(STYLE_URL[theme]);
  const style = (await res.json()) as StyleSpecification;
  const p = PALETTE[theme];
  return { ...style, layers: style.layers.map((l) => recolor(l, p)) };
}
