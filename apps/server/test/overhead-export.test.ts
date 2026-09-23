import { describe, expect, it } from 'vitest';
import { overhead } from '../src/api/overhead.js';
import { exportTrack } from '../src/api/track-export.js';
import type { TrackPoint } from '../src/history/track-history.js';
import { SpatialIndex } from '../src/state/spatial-index.js';
import { StateStore } from '../src/state/state-store.js';
import { makeAircraft, T0 } from './fixtures.js';

const OBS = { lat: 38.7, lon: -9.1 };
const deg = (m: number): number => m / 111_320;

function index(...aircraft: Parameters<typeof makeAircraft>[0][]): SpatialIndex {
  const store = new StateStore();
  store.upsertMany(aircraft.map((o) => makeAircraft(o)));
  return SpatialIndex.build(store.values());
}

describe('overhead', () => {
  it('ranks by elevation, highest in the sky first', () => {
    const list = overhead(
      index(
        // Almost overhead at 10 000 ft.
        { hex: '000001', lat: OBS.lat + deg(300), lon: OBS.lon, altBaro: 10_000 },
        // 20 km away at 36 000 ft: much lower in the sky.
        { hex: '000002', lat: OBS.lat + deg(20_000), lon: OBS.lon, altBaro: 36_000 },
      ),
      OBS.lat,
      OBS.lon,
      8,
    );
    expect(list.map((a) => a.hex)).toEqual(['000001', '000002']);
    expect(list[0]?.elevation).toBeGreaterThan(80);
    expect(list[0]?.azimuth).toBeCloseTo(0, 0);
    expect(list[1]?.elevation).toBeLessThan(30);
    expect(list[1]?.slantRangeNm).toBeGreaterThan(list[1]?.groundRangeNm ?? 0);
  });

  it('ignores aircraft on the ground, without altitude, below the horizon or too far', () => {
    const list = overhead(
      index(
        { hex: '000001', lat: OBS.lat + deg(500), lon: OBS.lon, onGround: true, altBaro: 0 },
        { hex: '000002', lat: OBS.lat + deg(500), lon: OBS.lon, altBaro: null },
        { hex: '000003', lat: OBS.lat + deg(400_000), lon: OBS.lon, altBaro: 36_000 },
      ),
      OBS.lat,
      OBS.lon,
      8,
    );
    expect(list).toEqual([]);
  });

  it('respects the limit and the observer elevation', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      hex: (0x100000 + i).toString(16),
      lat: OBS.lat + deg(1000 * (i + 1)),
      lon: OBS.lon,
      altBaro: 20_000,
    }));
    expect(overhead(index(...many), OBS.lat, OBS.lon, 5)).toHaveLength(5);
    const sea = overhead(index(...many), OBS.lat, OBS.lon, 1)[0]?.elevation ?? 0;
    const mountain =
      overhead(index(...many), OBS.lat, OBS.lon, 1, undefined, 10_000)[0]?.elevation ?? 0;
    expect(mountain).toBeLessThan(sea);
  });
});

describe('exportTrack', () => {
  const points: TrackPoint[] = [
    { t: T0, lat: 38.7, lon: -9.1, alt: 10_000, gs: 250, track: 90, vr: 1000 },
    { t: T0 + 30_000, lat: 38.8, lon: -9.0, alt: 12_000, gs: null, track: 90, vr: 800 },
  ];

  it('writes KML with absolute altitudes in metres and timestamps', () => {
    const kml = exportTrack(points, 'kml', 'TAP1234 <test>');
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2"');
    expect(kml).toContain('TAP1234 &lt;test&gt;');
    expect(kml).toContain('<altitudeMode>absolute</altitudeMode>');
    expect(kml).toContain('-9.100000,38.700000,3048');
    expect(kml).toContain(`<when>${new Date(T0).toISOString()}</when>`);
    expect(kml).toContain('Not for navigation');
  });

  it('writes GPX track points with elevation and time', () => {
    const gpx = exportTrack(points, 'gpx', 'TAP1234');
    expect(gpx).toContain('<gpx version="1.1" creator="SkyTrace"');
    expect(gpx).toContain('<trkpt lat="38.700000" lon="-9.100000">');
    expect(gpx).toContain('<ele>3048.0</ele>');
    expect(gpx).toContain(`<time>${new Date(T0).toISOString()}</time>`);
    // <speed> belongs to GPX 1.0; a 1.1 document with it fails validation.
    expect(gpx).not.toContain('<speed>');
  });

  it('handles an empty track and missing altitudes', () => {
    expect(exportTrack([], 'gpx', 'x')).toContain('<trkseg>');
    expect(
      exportTrack(
        [{ t: T0, lat: 1, lon: 2, alt: null, gs: null, track: null, vr: null }],
        'kml',
        'x',
      ),
    ).toContain('2.000000,1.000000,0');
  });
});
