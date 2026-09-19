import { worldCoverageGrid } from '@skytrace/geo';
import { pino } from 'pino';
import { buildApp } from './app.js';
import { loadConfig, MIRROR_MIN_INTERVAL_MS } from './config.js';
import { ADSB_V2_MIRRORS, AdsbV2Provider } from './ingest/adsb-v2-provider.js';
import { CoverageScheduler } from './ingest/coverage-scheduler.js';
import { DEFAULT_INGEST_OPTIONS, IngestWorker } from './ingest/ingest-worker.js';
import { OpenSkyProvider } from './ingest/opensky-provider.js';
import type { Provider } from './ingest/provider.js';
import { ProviderPool } from './ingest/provider-pool.js';
import { StateStore } from './state/state-store.js';

const config = loadConfig();
const logger = pino({
  level: config.LOG_LEVEL,
  ...(process.env['NODE_ENV'] === 'production' ? {} : { transport: { target: 'pino-pretty' } }),
});

const providers: Provider[] = config.PROVIDERS.map(
  (id) =>
    new AdsbV2Provider({ id, url: ADSB_V2_MIRRORS[id], minIntervalMs: MIRROR_MIN_INTERVAL_MS[id] }),
);
if (config.OPENSKY_ENABLED) providers.push(new OpenSkyProvider());

const store = new StateStore();
const pool = new ProviderPool(providers);
const scheduler = new CoverageScheduler(worldCoverageGrid());
const worker = new IngestWorker(pool, scheduler, store, logger, {
  ...DEFAULT_INGEST_OPTIONS,
  evictAfterMs: config.EVICT_AFTER_SEC * 1000,
});
const app = await buildApp({
  logger,
  store,
  worker,
  pool,
  scheduler,
  corsOrigin: config.CORS_ORIGIN,
});

let lastLog = 0;
worker.onIndex((index) => {
  const t = Date.now();
  if (t - lastLog < 30_000) return;
  lastLog = t;
  const heapMb = Math.round(process.memoryUsage().heapUsed / 1048576);
  logger.info({ aircraft: index.size, peak: store.peakSize, heapMb }, 'ingest status');
});

if (config.INGEST_ENABLED) worker.start();
await app.listen({ port: config.PORT, host: config.HOST });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info({ signal }, 'shutting down');
    void worker
      .stop()
      .then(() => app.close())
      .then(() => process.exit(0));
  });
}
