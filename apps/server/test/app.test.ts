import type { AddressInfo } from 'node:net';
import { decodeFrame, FrameType } from '@skytrace/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { CoverageScheduler } from '../src/ingest/coverage-scheduler.js';
import { IngestWorker } from '../src/ingest/ingest-worker.js';
import { ProviderPool } from '../src/ingest/provider-pool.js';
import { silentLogger } from '../src/logger.js';
import { SpatialIndex } from '../src/state/spatial-index.js';
import { StateStore } from '../src/state/state-store.js';
import { StreamHub } from '../src/stream/stream-hub.js';
import { makeAircraft, makeCircle } from './fixtures.js';

const now = Date.now();
const store = new StateStore();
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
const app = await buildApp({
  logger: false,
  store,
  worker,
  pool,
  scheduler,
  hub,
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
