import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';
import { loadMapStyle } from './map-style';

const style: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
    { id: 'water', type: 'fill', source: 's', paint: { 'fill-color': '#00f' } },
    { id: 'landcover', type: 'fill', source: 's', paint: {} },
    { id: 'boundary_3', type: 'line', source: 's', paint: {} },
    { id: 'waterway', type: 'line', source: 's', paint: {} },
    { id: 'roads', type: 'line', source: 's', paint: {} },
    { id: 'place_labels', type: 'symbol', source: 's', paint: {} },
  ],
};

describe('loadMapStyle', () => {
  it('repaints CARTO layers with the Nocturne palette', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ json: async () => structuredClone(style) });
    const dark = await loadMapStyle('dark', fetchFn);
    const byId = Object.fromEntries(dark.layers.map((l) => [l.id, l]));
    expect(fetchFn.mock.calls[0]?.[0]).toContain('dark-matter');
    expect(byId['background']?.type === 'background' && byId['background'].paint).toEqual({
      'background-color': '#1a1e2e',
    });
    expect(byId['water']?.paint).toMatchObject({ 'fill-color': '#10121d' });
    expect(byId['landcover']?.paint).toMatchObject({
      'fill-color': '#1a1e2e',
      'fill-opacity': 0.4,
    });
    expect(byId['boundary_3']?.paint).toMatchObject({ 'line-color': 'rgba(233,233,237,0.16)' });
    expect(byId['waterway']?.paint).toMatchObject({ 'line-color': '#10121d' });
    expect(byId['roads']?.paint).toMatchObject({ 'line-color': 'rgba(233,233,237,0.05)' });
    // Symbol layers keep their own paint.
    expect(byId['place_labels']?.paint).toEqual({});
  });

  it('uses the light basemap for the light theme', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ json: async () => structuredClone(style) });
    const light = await loadMapStyle('light', fetchFn);
    expect(fetchFn.mock.calls[0]?.[0]).toContain('positron');
    expect(light.layers[0]?.type === 'background' && light.layers[0].paint).toEqual({
      'background-color': '#e9ebf2',
    });
  });
});
