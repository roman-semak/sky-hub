import { describe, expect, it } from 'vitest';
import { ApiError, SkyTraceApi } from '../src/api.js';
import { TOOLS, type ToolDef } from '../src/tools.js';

const BASE = 'http://api.test';

interface Call {
  readonly url: string;
}

/** Serves canned JSON for the first matching path prefix. */
function stub(routes: Record<string, unknown>, status = 200): [SkyTraceApi, Call[]] {
  const calls: Call[] = [];
  const api = new SkyTraceApi(BASE, async (url) => {
    calls.push({ url });
    const path = new URL(url).pathname;
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (key === undefined || status !== 200) {
      return new Response(JSON.stringify({ error: 'nope' }), {
        status: status === 200 ? 404 : status,
      });
    }
    const body = routes[key];
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
  });
  return [api, calls];
}

/** Looks a tool up by name; arguments are checked by the tool's own schema. */
const tool = (name: string): ToolDef => {
  const t: ToolDef | undefined = TOOLS.find((x) => x.name === name);
  if (t === undefined) throw new Error(`no tool ${name}`);
  return t;
};

const FLIGHT = {
  hex: '4951ab',
  callsign: 'TAP1234',
  registration: 'CS-TJF',
  typeCode: 'A339',
  lat: 38.7,
  lon: -9.1,
  altBaro: 34_000,
  gs: 455,
  track: 187.5,
  baroRate: -64,
  squawk: '1000',
  emergency: 'none',
  military: false,
  onGround: false,
  posTime: Date.UTC(2026, 8, 23, 10, 0, 0),
  country: 'Portugal',
  airline: { name: 'TAP Air Portugal' },
  aircraftType: { name: 'Airbus A330-900' },
};

describe('tool definitions', () => {
  it('exposes unique, read-only, self-describing tools', () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.title).not.toBe('');
    }
  });
});

describe('get_flight', () => {
  it('renders the live state of one aircraft', async () => {
    const [api, calls] = stub({ '/api/ac/': FLIGHT });
    const text = await tool('get_flight').run(api, { hex: '4951AB' });
    expect(calls[0]?.url).toBe(`${BASE}/api/ac/4951ab`);
    expect(text).toContain('TAP1234 · 4951AB · CS-TJF');
    expect(text).toContain('Airbus A330-900');
    expect(text).toContain('Altitude 34,000 ft, 455 kt, track 188°');
  });

  it('explains a 404 instead of failing silently', async () => {
    const [api] = stub({});
    await expect(tool('get_flight').run(api, { hex: 'abcdef' })).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects a payload that does not match the API contract', async () => {
    const [api] = stub({ '/api/ac/': { hex: '4951ab' } });
    await expect(tool('get_flight').run(api, { hex: '4951ab' })).rejects.toThrow(
      /unexpected response/,
    );
  });
});

describe('search_flights', () => {
  it('lists aircraft, airports and airlines together', async () => {
    const [api, calls] = stub({
      '/api/search': {
        results: [
          {
            kind: 'aircraft',
            hex: '4951ab',
            callsign: 'TAP1234',
            registration: 'CS-TJF',
            typeCode: 'A339',
            lat: 38.7,
            lon: -9.1,
          },
          { kind: 'airport', icao: 'LPPT', iata: 'LIS', name: 'Lisbon', country: 'PT' },
          { kind: 'airline', name: 'TAP Air Portugal', icao: 'TAP' },
        ],
      },
    });
    const text = await tool('search_flights').run(api, { query: 'TAP', limit: 10 });
    expect(calls[0]?.url).toContain('q=TAP');
    expect(calls[0]?.url).toContain('limit=10');
    expect(text.split('\n')).toHaveLength(3);
    expect(text).toContain('airport · LPPT/LIS · Lisbon');
  });

  it('says so when nothing matches', async () => {
    const [api] = stub({ '/api/search': { results: [] } });
    expect(await tool('search_flights').run(api, { query: 'zzzz', limit: 5 })).toBe('No matches.');
  });
});

describe('flights_overhead', () => {
  it('sorts by elevation and says where to look', async () => {
    const [api, calls] = stub({
      '/api/overhead': {
        observer: { lat: 50.45, lon: 30.52, elevationFt: 600 },
        aircraft: [
          {
            hex: 'abc123',
            callsign: 'KLM24D',
            registration: 'PH-BXA',
            typeCode: 'B738',
            altitude: 36_000,
            gs: 470,
            azimuth: 214.6,
            elevation: 62.3,
            slantRangeNm: 7.2,
            groundRangeNm: 3.4,
          },
        ],
      },
    });
    const text = await tool('flights_overhead').run(api, {
      lat: 50.45,
      lon: 30.52,
      elevationFt: 600,
      limit: 10,
    });
    expect(calls[0]?.url).toContain('elevationFt=600');
    expect(text).toContain('elevation 62.3°, azimuth 215°');
    expect(text).toContain('7.2 nm slant');
  });

  it('reports an empty sky', async () => {
    const [api] = stub({
      '/api/overhead': { observer: { lat: 0, lon: 0, elevationFt: 0 }, aircraft: [] },
    });
    const text = await tool('flights_overhead').run(api, {
      lat: 0,
      lon: 0,
      elevationFt: 0,
      limit: 5,
    });
    expect(text).toBe('Nothing above the horizon right now.');
  });
});

describe('flight_track', () => {
  it('thins long tracks to the requested row count', async () => {
    const points = Array.from({ length: 100 }, (_, i) => ({
      t: Date.UTC(2026, 8, 23, 10, 0, 0) + i * 1000,
      lat: 38 + i / 1000,
      lon: -9 + i / 1000,
      alt: 30_000,
      gs: 450,
    }));
    const [api, calls] = stub({ '/api/track/': { hex: '4951ab', points } });
    const text = await tool('flight_track').run(api, { hex: '4951ab', hours: 1, maxRows: 10 });
    expect(calls[0]?.url).toContain('from=');
    // 100 fixes, 10 rows wanted → every 10th, plus the header line.
    expect(text.split('\n')).toHaveLength(11);
    expect(text).toContain('100 recorded fixes, showing every 10');
  });

  it('says when nothing was recorded', async () => {
    const [api] = stub({ '/api/track/': { hex: '4951ab', points: [] } });
    const text = await tool('flight_track').run(api, { hex: '4951ab', hours: 1, maxRows: 40 });
    expect(text).toBe('No recorded track for 4951AB.');
  });
});

describe('export_track', () => {
  it('passes the format through and returns the document', async () => {
    const [api, calls] = stub({ '/api/track/': '<?xml version="1.0"?><kml/>' });
    const text = await tool('export_track').run(api, { hex: '4951ab', format: 'kml', hours: 2 });
    expect(calls[0]?.url).toContain('format=kml');
    expect(text).toContain('<kml/>');
  });
});

describe('airport_status', () => {
  it('groups traffic by role under the weather', async () => {
    const [api] = stub({
      '/api/airport/': {
        icao: 'LPPT',
        iata: 'LIS',
        name: 'Humberto Delgado',
        country: 'Portugal',
        lat: 38.77,
        lon: -9.13,
        metar: {
          raw: 'LPPT 231000Z 35012KT 9999 FEW030 24/12 Q1017',
          observedAt: Date.UTC(2026, 8, 23, 10, 0, 0),
          windDir: 350,
          windKt: 12,
          visibility: '9999',
          category: 'VFR',
        },
        taf: { raw: 'TAF LPPT 230800Z 2309/2412 34010KT' },
        traffic: [
          {
            hex: '4951ab',
            callsign: 'TAP1234',
            typeCode: 'A339',
            role: 'arrival',
            distanceNm: 12.4,
            altitude: 4200,
          },
          {
            hex: '4951ac',
            callsign: 'RYR55X',
            typeCode: 'B738',
            role: 'departure',
            distanceNm: 8.1,
            altitude: 7000,
          },
        ],
      },
    });
    const text = await tool('airport_status').run(api, { code: 'lppt' });
    expect(text).toContain('LPPT/LIS · Humberto Delgado');
    expect(text).toContain('Wind 350° 12 kt');
    expect(text).toContain('arrival (1):');
    expect(text).toContain('departure (1):');
  });
});

describe('traffic_stats and busiest_areas', () => {
  it('summarises the network', async () => {
    const [api] = stub({
      '/api/stats': {
        generatedAt: Date.UTC(2026, 8, 23, 10, 0, 0),
        total: 8600,
        airborne: 8000,
        onGround: 600,
        military: 42,
        emergencies: [{ hex: 'abc123', callsign: 'RSQ1', squawk: '7700' }],
        altitudeBands: [
          [0, 500],
          [35_000, 3000],
        ],
        topOperators: [['Ryanair', 300]],
        topTypes: [['A320', 800]],
      },
    });
    const text = await tool('traffic_stats').run(api, {});
    expect(text).toContain('8600 tracked, 8000 airborne');
    expect(text).toContain('RSQ1 (7700)');
    expect(text).toContain('FL350+ 3000');
  });

  it('reports the busiest cells with their real size', async () => {
    const [api, calls] = stub({
      '/api/heatmap': {
        windowHours: 24,
        cellDeg: 0.25,
        max: 940,
        cells: [{ lat: 47.625, lon: 8.125, count: 940 }],
      },
    });
    const text = await tool('busiest_areas').run(api, { bbox: [5, 45, 11, 49], limit: 15 });
    expect(calls[0]?.url).toContain('bbox=5%2C45%2C11%2C49');
    expect(calls[0]?.url).not.toContain('limit=');
    expect(text).toContain('0.25° ≈ 15 nm per cell, peak 940');
    expect(text).toContain('47.63, 8.13 · 940 fixes');
  });

  it('says when a region has no recorded traffic', async () => {
    const [api] = stub({
      '/api/heatmap': { windowHours: 24, cellDeg: 0.25, max: 0, cells: [] },
    });
    const text = await tool('busiest_areas').run(api, { bbox: [0, 0, 1, 1], limit: 5 });
    expect(text).toBe('No recorded traffic in that area yet.');
  });
});

describe('get_route', () => {
  it('renders both ends and warns about the source', async () => {
    const [api] = stub({
      '/api/route/': {
        callsign: 'TAP1234',
        origin: { icao: 'LPPT', iata: 'LIS', name: 'Lisbon', city: 'Lisbon' },
        destination: { icao: 'EDDF', iata: 'FRA', name: 'Frankfurt', city: 'Frankfurt' },
        airline: 'TAP Air Portugal',
        source: 'adsbdb',
      },
    });
    const text = await tool('get_route').run(api, { callsign: 'tap1234' });
    expect(text).toContain('LPPT/LIS Lisbon (Lisbon) → EDDF/FRA Frankfurt (Frankfurt)');
    expect(text).toContain('may be the other leg');
  });
});
