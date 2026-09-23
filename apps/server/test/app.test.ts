import type { AddressInfo } from 'node:net';
import { decodeFrame, FrameType } from '@skytrace/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../src/app.js';
import { HistoryService } from '../src/history/history-service.js';
import { TrackHistory } from '../src/history/track-history.js';
import { RouteService } from '../src/routes/route-service.js';
import { loadConfig } from '../src/config.js';
import { CoverageScheduler } from '../src/ingest/coverage-scheduler.js';
import { IngestWorker } from '../src/ingest/ingest-worker.js';
import { ProviderPool } from '../src/ingest/provider-pool.js';
import { silentLogger } from '../src/logger.js';
import { SpatialIndex } from '../src/state/spatial-index.js';
import { StateStore } from '../src/state/state-store.js';
import { StreamHub } from '../src/stream/stream-hub.js';
import { StaticIndex } from '@skytrace/static-data';
import type { RouteProvider } from '../src/routes/route-providers.js';
import { makeAircraft, makeCircle } from './fixtures.js';

const now = Date.now();
const history = new TrackHistory();
const store = new StateStore((ac) => {
  history.record(ac);
});
store.upsertMany([
  makeAircraft({ posTime: now, seenTime: now }),
  makeAircraft({ hex: '000002', callsign: 'KLM1', posTime: now, seenTime: now }),
]);
const pool = new ProviderPool([]);
const scheduler = new CoverageScheduler([makeCircle('a', 1, 1)]);
const worker = new IngestWorker(pool, scheduler, store, silentLogger);
const hub = new StreamHub(silentLogger, (v) => {
  scheduler.setDemand(v);
});
hub.publish(SpatialIndex.build(store.values()), []);
const staticIndex = new StaticIndex({
  version: 1,
  generatedAt: '2026-09-21T00:00:00Z',
  airports: [
    {
      icao: 'LPPT',
      iata: 'LIS',
      name: 'Humberto Delgado Airport',
      city: 'Lisbon',
      country: 'PT',
      lat: 38.78,
      lon: -9.13,
      elevationFt: 374,
      kind: 'large',
    },
    {
      icao: 'LPMA',
      iata: 'FNC',
      name: 'Madeira Airport',
      city: 'Funchal',
      country: 'PT',
      lat: 32.69,
      lon: -16.77,
      elevationFt: 192,
      kind: 'large',
    },
  ],
  airlines: [
    {
      icao: 'TAP',
      iata: 'TP',
      name: 'TAP Air Portugal',
      callsign: 'AIR PORTUGAL',
      country: 'Portugal',
    },
  ],
  types: [{ code: 'A20N', name: 'AIRBUS A-320neo', desc: 'L2J', wtc: 'M' }],
});
const routeProvider: RouteProvider = {
  id: 'adsbdb',
  lookup: async (callsign) =>
    callsign === 'TAP123'
      ? {
          callsign,
          origin: { icao: 'LPMA', iata: 'FNC', name: 'x', city: null, lat: 0, lon: 0 },
          destination: { icao: 'LPPT', iata: 'LIS', name: 'y', city: null, lat: 0, lon: 0 },
          airline: 'TAP Portugal',
          source: 'adsbdb',
        }
      : null,
};
const routes = new RouteService([routeProvider], staticIndex, silentLogger);
const app = await buildApp({
  logger: false,
  store,
  worker,
  pool,
  scheduler,
  hub,
  staticIndex,
  routes,
  history: new HistoryService(null, null, history),
  weather: null,
  wind: null,
  retentionMs: 3_600_000,
  corsOrigin: '*',
  maxConnectionsPerIp: 2,
});
let base = '';

beforeAll(async () => {
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app.close();
});

describe('REST', () => {
  it('GET /healthz', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.json()).toMatchObject({
      status: 'ok',
      aircraft: 2,
      scheduler: { circles: 1 },
      stream: { clients: 0 },
    });
  });

  it('GET /api/ac/:hex', async () => {
    expect((await app.inject('/api/ac/ABCDEF')).json()).toMatchObject({
      hex: 'abcdef',
      callsign: 'TAP123',
    });
    expect((await app.inject('/api/ac/123456')).statusCode).toBe(404);
    expect((await app.inject('/api/ac/xyz')).statusCode).toBe(400);
  });

  it('GET /api/search', async () => {
    const res = await app.inject('/api/search?q=klm');
    expect(res.json()).toMatchObject({ results: [{ hex: '000002' }] });
    expect((await app.inject('/api/search')).statusCode).toBe(400);
  });

  it('GET /api/ac/:hex is enriched with static data', async () => {
    expect((await app.inject('/api/ac/abcdef')).json()).toMatchObject({
      airline: { name: 'TAP Air Portugal' },
      aircraftType: { code: 'A20N' },
      country: 'US',
    });
  });

  it('GET /api/search covers flights, airlines and airports', async () => {
    const all = (await app.inject('/api/search?q=tap')).json<{ results: { kind: string }[] }>();
    expect(all.results.map((r) => r.kind)).toEqual(['aircraft', 'airline']);
    const airports = (await app.inject('/api/search?q=lisbon&kind=airports')).json<{
      results: { kind: string; icao: string; size: string }[];
    }>();
    expect(airports.results[0]).toMatchObject({ kind: 'airport', icao: 'LPPT', size: 'large' });
  });

  it('GET /api/route/:callsign', async () => {
    const res = (await app.inject('/api/route/tap123')).json<{ origin: { name: string } }>();
    // Provider names are replaced by our own airport table.
    expect(res.origin.name).toBe('Madeira Airport');
    expect((await app.inject('/api/route/KLM1')).statusCode).toBe(404);
    expect((await app.inject('/api/route/x')).statusCode).toBe(400);
  });

  it('GET /api/track/:hex returns the recorded, simplified track', async () => {
    const res = (await app.inject('/api/track/abcdef')).json<{ points: unknown[]; raw: number }>();
    expect(res.raw).toBe(1);
    expect(res.points).toHaveLength(1);
    expect((await app.inject('/api/track/zz')).statusCode).toBe(400);
  });

  it('GET /api/track/:hex validates the window', async () => {
    expect((await app.inject('/api/track/abcdef?from=10&to=5')).statusCode).toBe(400);
  });

  it('GET /api/track/:hex?format= exports KML and GPX', async () => {
    const kml = await app.inject('/api/track/abcdef?format=kml');
    expect(kml.statusCode).toBe(200);
    expect(kml.headers['content-type']).toContain('vnd.google-earth.kml');
    expect(kml.headers['content-disposition']).toContain('skytrace-abcdef.kml');
    expect(kml.body).toContain('<gx:Track>');
    const gpx = await app.inject('/api/track/abcdef?format=gpx');
    expect(gpx.body).toContain('<trkpt');
    expect((await app.inject('/api/track/999999?format=gpx')).statusCode).toBe(404);
    expect((await app.inject('/api/track/abcdef?format=csv')).statusCode).toBe(400);
  });

  it('GET /api/overhead ranks what is above a point', async () => {
    const res = await app.inject('/api/overhead?lat=38.77&lon=-9.13&limit=3');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ observer: { lat: 38.77, lon: -9.13 } });
    expect((await app.inject('/api/overhead?lat=100&lon=0')).statusCode).toBe(400);
  });

  it('GET /api/flights/:hex', async () => {
    const res = (await app.inject('/api/flights/abcdef')).json<{ flights: unknown[] }>();
    expect(res.flights).toHaveLength(1);
    expect((await app.inject('/api/flights/nothex')).statusCode).toBe(400);
  });

  it('GET /api/history returns binary playback frames', async () => {
    const t = Date.now();
    const ok = await app.inject(
      `/api/history?bbox=-11,37,-8,40&from=${t - 600_000}&to=${t + 1000}`,
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('application/octet-stream');
    // No Parquet reader or writer in this app instance: an empty, valid payload.
    expect(ok.rawPayload.byteLength).toBe(0);
    expect((await app.inject(`/api/history?bbox=-11,37,-8,40&from=0&to=${t}`)).statusCode).toBe(
      400,
    );
    expect((await app.inject('/api/history?bbox=1,2,3&from=0&to=1')).statusCode).toBe(400);
  });

  it('GET /api/airport/:code', async () => {
    expect((await app.inject('/api/airport/LIS')).json()).toMatchObject({
      icao: 'LPPT',
      metar: null,
      taf: null,
      windHistory: [],
    });
    expect((await app.inject('/api/airport/ZZZZ')).statusCode).toBe(404);
    expect((await app.inject('/api/airport/!!')).statusCode).toBe(400);
  });

  it('GET /api/wind needs a configured source and a valid level', async () => {
    expect((await app.inject('/api/wind?bbox=-10,37,-8,40&level=250')).statusCode).toBe(503);
    expect((await app.inject('/api/wind?bbox=-10,37,-8,40&level=300')).statusCode).toBe(400);
  });

  it('GET /api/stats is cached', async () => {
    const a = (await app.inject('/api/stats')).json<{ generatedAt: number; total: number }>();
    const b = (await app.inject('/api/stats')).json<{ generatedAt: number }>();
    expect(a.total).toBe(2);
    expect(b.generatedAt).toBe(a.generatedAt);
  });
});

function open(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}/stream`);
    ws.binaryType = 'arraybuffer';
    ws.once('open', () => {
      resolve(ws);
    });
    ws.once('error', reject);
  });
}

describe('WS /stream', () => {
  it('streams a binary snapshot after subscribing', async () => {
    const ws = await open();
    const frame = new Promise<ArrayBuffer>((resolve) => {
      ws.on('message', (data, isBinary) => {
        if (isBinary) resolve(data as ArrayBuffer);
      });
    });
    ws.send(JSON.stringify({ t: 'sub', bbox: [-11, 37, -8, 40], zoom: 9 }));
    const f = decodeFrame(await frame);
    expect(f.type).toBe(FrameType.Snapshot);
    expect(f.type === FrameType.Snapshot && f.records).toHaveLength(2);
    ws.send(Buffer.from([1, 2, 3]));
    const closed = new Promise((resolve) => ws.once('close', resolve));
    ws.close();
    await closed;
  });

  it('limits concurrent connections per IP', async () => {
    // Give the server a moment to register the previous test's disconnect.
    await new Promise((r) => setTimeout(r, 50));
    const a = await open();
    const b = await open();
    const c = await open();
    const code = await new Promise<number>((resolve) => c.once('close', resolve));
    expect(code).toBe(1008);
    expect(a.readyState).toBe(WebSocket.OPEN);
    a.close();
    b.close();
  });
});

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({})).toMatchObject({
      PORT: 8080,
      PROVIDERS: ['adsb.fi', 'adsb.lol'],
      OPENSKY_ENABLED: true,
      HISTORY_RETENTION_HOURS: 72,
      EVICT_AFTER_SEC: 180,
    });
  });
  it('parses overrides and rejects unknown providers', () => {
    expect(
      loadConfig({ PROVIDERS: 'adsb.lol, airplanes.live', OPENSKY_ENABLED: '0' }),
    ).toMatchObject({
      PROVIDERS: ['adsb.lol', 'airplanes.live'],
      OPENSKY_ENABLED: false,
    });
    expect(() => loadConfig({ PROVIDERS: 'flightradar24' })).toThrow();
  });
});
