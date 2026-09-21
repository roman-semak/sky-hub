import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../src/app.js';
import { HistoryService } from '../src/history/history-service.js';
import { TrackHistory } from '../src/history/track-history.js';
import { RouteService } from '../src/routes/route-service.js';
import { CoverageScheduler } from '../src/ingest/coverage-scheduler.js';
import { IngestWorker } from '../src/ingest/ingest-worker.js';
import { ProviderPool } from '../src/ingest/provider-pool.js';
import { silentLogger } from '../src/logger.js';
import { SpatialIndex } from '../src/state/spatial-index.js';
import { StateStore } from '../src/state/state-store.js';
import { StreamHub } from '../src/stream/stream-hub.js';
import { makeAircraft } from './fixtures.js';

const CLIENTS = 200;
const AIRCRAFT = 20_000;
const TICKS = 8;

/**
 * Phase 2 DoD: 200 concurrent WebSocket clients, p99 publish → receive
 * latency < 100 ms. Clients and server share one process here, which only
 * makes the measurement more pessimistic.
 */
describe('load: 200 WebSocket clients', () => {
  it('keeps p99 update latency under 100 ms', { timeout: 60_000 }, async () => {
    const store = new StateStore();
    const pool = new ProviderPool([]);
    const scheduler = new CoverageScheduler([]);
    const worker = new IngestWorker(pool, scheduler, store, silentLogger);
    const hub = new StreamHub(silentLogger, () => undefined);
    const app = await buildApp({
      logger: false,
      store,
      worker,
      pool,
      scheduler,
      hub,
      staticIndex: null,
      routes: new RouteService([], null, silentLogger),
      history: new HistoryService(null, null, new TrackHistory()),
      weather: null,
      wind: null,
      retentionMs: 3_600_000,
      corsOrigin: '*',
      maxConnectionsPerIp: CLIENTS + 10,
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const url = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/stream`;

    // 20k aircraft over Europe.
    const place = (i: number, t: number) =>
      makeAircraft({
        hex: (0x100000 + i).toString(16),
        lat: 36 + ((i * 7919) % 2400) / 100,
        lon: -10 + ((i * 104729) % 4000) / 100 + (t % 60) * 0.001,
        altBaro: (i * 37) % 40000,
        posTime: t,
        seenTime: t,
      });

    let publishedAt = 0;
    const latencies: number[] = [];
    const connect = (i: number) =>
      new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(url, { perMessageDeflate: true });
        ws.binaryType = 'arraybuffer';
        ws.on('message', (_data, isBinary) => {
          if (isBinary && publishedAt > 0) latencies.push(performance.now() - publishedAt);
        });
        ws.once('open', () => {
          // Zoom-8 viewports (~3° × 2°) scattered over the data.
          const w = -10 + (i % 18) * 2;
          const s = 36 + Math.floor(i / 18) * 2;
          ws.send(JSON.stringify({ t: 'sub', bbox: [w, s, w + 3, s + 2], zoom: 8 }));
          resolve(ws);
        });
        ws.once('error', reject);
      });
    // Connect in batches: macOS caps the listen backlog at 128.
    const clients: WebSocket[] = [];
    for (let i = 0; i < CLIENTS; i += 50) {
      const batch = Array.from({ length: Math.min(50, CLIENTS - i) }, (_, k) => connect(i + k));
      clients.push(...(await Promise.all(batch)));
    }

    const perTick: number[] = [];
    const fanout: number[] = [];
    for (let tick = 0; tick < TICKS; tick++) {
      const t = Date.now();
      for (let i = 0; i < AIRCRAFT; i++) store.upsert(place(i, t + tick * 1000));
      const index = SpatialIndex.build(store.values());
      latencies.length = 0;
      publishedAt = performance.now();
      hub.publish(index, []);
      fanout.push(hub.statistics.lastFanoutMs);
      await new Promise((r) => setTimeout(r, 1000));
      if (tick > 0) perTick.push(...latencies);
    }

    for (const ws of clients) ws.close();
    await app.close();

    perTick.sort((a, b) => a - b);
    const p99 = perTick[Math.floor(perTick.length * 0.99)] ?? Infinity;
    const p50 = perTick[Math.floor(perTick.length * 0.5)] ?? Infinity;
    process.stdout.write(
      `load: ${perTick.length} frames, p50 ${p50.toFixed(1)} ms, p99 ${p99.toFixed(1)} ms, fan-out ${Math.max(...fanout)} ms max\n`,
    );
    expect(perTick.length).toBeGreaterThan(CLIENTS * (TICKS - 1) * 0.9);
    expect(p99).toBeLessThan(100);
  });
});
