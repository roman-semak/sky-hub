import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { CoverageScheduler } from '../src/ingest/coverage-scheduler.js';
import { IngestWorker } from '../src/ingest/ingest-worker.js';
import { ProviderPool } from '../src/ingest/provider-pool.js';
import { silentLogger } from '../src/logger.js';
import { StateStore } from '../src/state/state-store.js';
import { makeAircraft, makeCircle, T0 } from './fixtures.js';

describe('GET /healthz', () => {
  it('reports ingest health', async () => {
    const store = new StateStore();
    store.upsert(makeAircraft());
    const pool = new ProviderPool([]);
    const scheduler = new CoverageScheduler([makeCircle('a', 1, 1)]);
    const worker = new IngestWorker(pool, scheduler, store, silentLogger);
    const app = await buildApp({
      logger: false,
      store,
      worker,
      pool,
      scheduler,
      corsOrigin: '*',
      now: () => T0,
    });
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.json()).toMatchObject({ status: 'ok', aircraft: 1, scheduler: { circles: 1 } });
    await app.close();
  });
});

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({})).toMatchObject({
      PORT: 8080,
      PROVIDERS: ['adsb.fi', 'adsb.lol'],
      OPENSKY_ENABLED: true,
      HISTORY_RETENTION_HOURS: 72,
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
