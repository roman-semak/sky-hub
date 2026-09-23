import { describe, expect, it, vi } from 'vitest';
import { airportTraffic, classify } from '../src/airport/airport-traffic.js';
import { SpatialIndex } from '../src/state/spatial-index.js';
import { StateStore } from '../src/state/state-store.js';
import { AviationWeather } from '../src/weather/aviation-weather.js';
import { WindAloft } from '../src/weather/wind-aloft.js';
import { jsonResponse, makeAircraft } from './fixtures.js';

const METAR = {
  icaoId: 'LPPT',
  obsTime: 1_790_000_000,
  rawOb: 'METAR LPPT 211330Z 08006G21KT CAVOK 31/14 Q1022 NOSIG',
  temp: 31,
  dewp: 14,
  wdir: 80,
  wspd: 6,
  wgst: 21,
  visib: '6+',
  altim: 1022,
  fltCat: 'VFR',
  clouds: [{ cover: 'FEW', base: 3000 }, { cover: 'SCT' }],
};

describe('AviationWeather', () => {
  it('parses METARs newest first and caches for 5 minutes', async () => {
    let now = 0;
    const older = { ...METAR, obsTime: METAR.obsTime - 3600, wdir: 'VRB', visib: 10 };
    const fetchFn = vi
      .fn()
      .mockImplementation(async () => jsonResponse([older, METAR, { junk: true }]));
    const w = new AviationWeather(fetchFn, () => now);
    const list = await w.metars('LPPT', 24);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      station: 'LPPT',
      observedAt: METAR.obsTime * 1000,
      windDir: 80,
      gustKt: 21,
      visibility: '6+',
      qnhHpa: 1022,
      category: 'VFR',
      clouds: [
        { cover: 'FEW', baseFt: 3000 },
        { cover: 'SCT', baseFt: null },
      ],
    });
    expect(list[1]).toMatchObject({ windDir: null, visibility: '10' });
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain('/metar?ids=LPPT&format=json&hours=24');
    await w.metars('LPPT', 24);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now = 6 * 60_000;
    await w.metars('LPPT', 24);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good answer when the upstream hiccups', async () => {
    let now = 0;
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([METAR]))
      .mockResolvedValue(new Response('busy', { status: 503 }));
    const w = new AviationWeather(fetchFn, () => now);

    expect(await w.metars('LPPT', 1)).toHaveLength(1);
    now += 10 * 60_000; // past the 5 min TTL
    // A 503 must not blank the station for another TTL.
    expect(await w.metars('LPPT', 1)).toHaveLength(1);
  });

  it('parses a TAF', async () => {
    const w = new AviationWeather(async () =>
      jsonResponse([
        {
          icaoId: 'LPPT',
          issueTime: '2026-09-21T11:00:00.000Z',
          validTimeFrom: 1,
          validTimeTo: 2,
          rawTAF: 'TAF LPPT ...',
        },
      ]),
    );
    expect(await w.taf('LPPT')).toEqual({
      station: 'LPPT',
      issuedAt: Date.parse('2026-09-21T11:00:00.000Z'),
      validFrom: 1000,
      validTo: 2000,
      raw: 'TAF LPPT ...',
    });
  });

  it('degrades to empty on no data, errors and garbage', async () => {
    expect(
      await new AviationWeather(async () => new Response(null, { status: 204 })).metars('XXXX'),
    ).toEqual([]);
    expect(
      await new AviationWeather(async () => jsonResponse({ error: 1 })).metars('XXXX'),
    ).toEqual([]);
    expect(await new AviationWeather(async () => jsonResponse([])).taf('XXXX')).toBeNull();
    const failing = new AviationWeather(async () => {
      throw new Error('offline');
    });
    expect(await failing.metars('LPPT')).toEqual([]);
  });
});

describe('WindAloft', () => {
  const NOW = Date.UTC(2026, 8, 21, 13, 20);
  const hour = '2026-09-21T13:00';

  function point(speedKmh: number, dir: number) {
    return {
      hourly: {
        time: ['2026-09-21T12:00', hour],
        wind_speed_250hPa: [0, speedKmh],
        wind_direction_250hPa: [0, dir],
      },
    };
  }

  it('samples an 8×8 grid and converts to u/v m/s for the current hour', async () => {
    const fetchFn = vi
      .fn()
      .mockImplementation(async () =>
        jsonResponse(Array.from({ length: 64 }, () => point(36, 270))),
      );
    const w = new WindAloft(fetchFn, () => NOW);
    const grid = await w.grid([-10.2, 37.1, -8.1, 39.9], 250);
    expect(grid).toMatchObject({
      level: 250,
      cols: 8,
      rows: 8,
      bbox: [-10, 37, -8, 40],
      time: Date.parse(`${hour}:00Z`),
    });
    // Westerly wind (from 270°) blows towards the east: u = +10 m/s, v ≈ 0.
    expect(grid?.u[0]).toBeCloseTo(10, 6);
    expect(grid?.v[0]).toBeCloseTo(0, 6);
    const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(url.searchParams.get('latitude')?.split(',')).toHaveLength(64);
    expect(url.searchParams.get('hourly')).toBe('wind_speed_250hPa,wind_direction_250hPa');
    await w.grid([-10.1, 37, -8, 40], 250);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refuses to serve a forecast for another hour', async () => {
    const stale = {
      hourly: {
        time: ['2026-09-20T13:00'],
        wind_speed_250hPa: [100],
        wind_direction_250hPa: [270],
      },
    };
    const w = new WindAloft(
      async () => jsonResponse(Array.from({ length: 64 }, () => stale)),
      () => NOW,
    );
    expect(await w.grid([-10.2, 37.1, -8.1, 39.9], 250)).toBeNull();
  });

  it('never collapses a small viewport to a single point', async () => {
    const fetchFn = vi
      .fn()
      .mockImplementation(async () =>
        jsonResponse(Array.from({ length: 64 }, () => point(36, 270))),
      );
    const w = new WindAloft(fetchFn, () => NOW);
    const grid = await w.grid([-9.15, 38.7, -9.1, 38.75], 250);

    expect(grid?.bbox[2]).toBeGreaterThan(grid?.bbox[0] ?? 0);
    expect(grid?.bbox[3]).toBeGreaterThan(grid?.bbox[1] ?? 0);
    const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(new Set(url.searchParams.get('latitude')?.split(',')).size).toBeGreaterThan(1);
  });

  it('returns null on bad upstream data', async () => {
    expect(
      await new WindAloft(
        async () => jsonResponse([point(1, 1)]),
        () => NOW,
      ).grid([0, 0, 1, 1], 250),
    ).toBeNull();
    expect(
      await new WindAloft(
        async () => new Response('', { status: 500 }),
        () => NOW,
      ).grid([0, 0, 1, 1], 250),
    ).toBeNull();
    const failing = new WindAloft(async () => {
      throw new Error('x');
    });
    expect(await failing.grid([0, 0, 1, 1], 500)).toBeNull();
  });
});

describe('airport traffic', () => {
  // LPPT at 38.78, -9.13.
  const lat = 38.78;
  const lon = -9.13;

  it('classifies arrivals, departures, ground and overflights', () => {
    const at = (o: Parameters<typeof makeAircraft>[0]) => classify(makeAircraft(o), lat, lon, 374);
    expect(at({ onGround: true })).toBe('ground');
    expect(at({ altBaro: 500, gs: 20 })).toBe('ground');
    // North of the field heading south, descending.
    expect(at({ lat: 39.1, lon: -9.13, track: 180, altBaro: 5000, baroRate: -900 })).toBe(
      'arrival',
    );
    // Descending but heading away at FL300: someone else's arrival.
    expect(at({ lat: 39.1, lon: -9.13, track: 0, altBaro: 30000, baroRate: -900 })).toBe(
      'overflight',
    );
    // Climbing away.
    expect(at({ lat: 39.1, lon: -9.13, track: 0, altBaro: 8000, baroRate: 2000 })).toBe(
      'departure',
    );
    // Climbing high towards the field: overflight climbing out of elsewhere.
    expect(at({ lat: 39.1, lon: -9.13, track: 180, altBaro: 25000, baroRate: 1500 })).toBe(
      'overflight',
    );
    // Level, low, inbound.
    expect(at({ lat: 39.1, lon: -9.13, track: 180, altBaro: 4000, baroRate: 0 })).toBe('arrival');
    // Level cruise above.
    expect(at({ lat: 39.1, lon: -9.13, track: 90, altBaro: 36000, baroRate: 0 })).toBe(
      'overflight',
    );
  });

  it('does not read an unknown altitude as sea level', () => {
    const at = (o: Parameters<typeof makeAircraft>[0]) => classify(makeAircraft(o), lat, lon, 374);
    // Level, heading at the field, altitude unknown: not an arrival.
    expect(at({ lat: 39.1, lon: -9.13, track: 180, altBaro: null, baroRate: 0 })).toBe(
      'overflight',
    );
    // Descending towards the field is still an arrival without an altitude.
    expect(at({ lat: 39.1, lon: -9.13, track: 180, altBaro: null, baroRate: -900 })).toBe(
      'arrival',
    );
  });

  it('lists traffic within 50 nm sorted by distance', () => {
    const store = new StateStore();
    store.upsertMany([
      makeAircraft({ hex: '000001', lat: 38.9, lon: -9.13 }),
      makeAircraft({ hex: '000002', lat: 38.8, lon: -9.13, onGround: true, altBaro: 0 }),
      makeAircraft({ hex: '000003', lat: 41, lon: -9.13 }),
    ]);
    const list = airportTraffic(SpatialIndex.build(store.values()), lat, lon, 374);
    expect(list.map((t) => t.hex)).toEqual(['000002', '000001']);
    expect(list[0]).toMatchObject({ role: 'ground', altitude: 0 });
    expect(list[1]?.distanceNm).toBeCloseTo(7.2, 0);
  });
});
