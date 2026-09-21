import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STATE, parseMapState, serializeMapState } from './url-state';

describe('map URL state', () => {
  it('parses a full URL', () => {
    const s = parseMapState(new URLSearchParams('lat=38.77&lon=-9.13&z=9&sel=4951AB'));
    expect(s).toEqual({ lat: 38.77, lon: -9.13, zoom: 9, selected: '4951ab' });
  });

  it('falls back per field on missing or invalid values', () => {
    expect(parseMapState(new URLSearchParams(''))).toEqual(DEFAULT_MAP_STATE);
    const s = parseMapState(new URLSearchParams('lat=999&lon=-9.13&z=abc&sel=nope'));
    expect(s).toEqual({
      lat: DEFAULT_MAP_STATE.lat,
      lon: -9.13,
      zoom: DEFAULT_MAP_STATE.zoom,
      selected: null,
    });
  });

  it('accepts non-ICAO selections', () => {
    expect(parseMapState(new URLSearchParams('sel=~abcdef')).selected).toBe('~abcdef');
  });

  it('round-trips through serialization', () => {
    const state = { lat: 38.7712, lon: -9.1359, zoom: 9.25, selected: '4951ab' };
    const params = new URLSearchParams(
      Object.entries(serializeMapState(state)).flatMap(([k, v]) =>
        v === null ? [] : [[k, v] as [string, string]],
      ),
    );
    const back = parseMapState(params);
    expect(back.lat).toBeCloseTo(state.lat, 3);
    expect(back.lon).toBeCloseTo(state.lon, 3);
    expect(back.zoom).toBe(9.25);
    expect(back.selected).toBe('4951ab');
  });

  it('drops the selection key when nothing is selected', () => {
    expect(serializeMapState({ ...DEFAULT_MAP_STATE, selected: null })['sel']).toBeNull();
  });
});
