import { worldCoverageGrid } from '@skytrace/geo';
import { pino } from 'pino';
import { buildApp } from './app.js';
import { loadConfig, MIRROR_MIN_INTERVAL_MS } from './config.js';
import { serveWeb } from './web-static.js';
import { ADSB_V2_MIRRORS, AdsbV2Provider } from './ingest/adsb-v2-provider.js';
import { CoverageScheduler } from './ingest/coverage-scheduler.js';
import { DEFAULT_INGEST_OPTIONS, IngestWorker } from './ingest/ingest-worker.js';
import { OpenSkyProvider } from './ingest/opensky-provider.js';
import type { Provider } from './ingest/provider.js';
import { ProviderPool } from './ingest/provider-pool.js';
import { StateStore } from './state/state-store.js';
import { StreamHub } from './stream/stream-hub.js';
import { countryOfIcao24 } from '@skytrace/static-data';
import { purgeHistory } from './history/history-retention.js';
import { HistoryReader } from './history/history-reader.js';
import { HistoryService } from './history/history-service.js';
import { HistoryWriter } from './history/history-writer.js';
import { TrackHistory } from './history/track-history.js';
import { AdsbdbRouteProvider, AdsbLolRouteProvider } from './routes/route-providers.js';
import { RouteService } from './routes/route-service.js';
import { loadStaticData } from './static/load-static-data.js';
import { AviationWeather } from './weather/aviation-weather.js';
import { WindAloft } from './weather/wind-aloft.js';

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

const staticIndex = await loadStaticData(config.STATIC_DATA_PATH, logger);
const recentTracks = new TrackHistory();
const historyWriter = config.HISTORY_ENABLED
  ? new HistoryWriter(
      {
        dir: config.HISTORY_DIR,
        flushMs: config.HISTORY_FLUSH_SEC * 1000,
        maxBufferedRows: 500_000,
      },
      logger,
    )
  : null;
const history = new HistoryService(
  config.HISTORY_ENABLED ? new HistoryReader(config.HISTORY_DIR) : null,
  historyWriter,
  recentTracks,
);
const retentionMs = config.HISTORY_RETENTION_HOURS * 3_600_000;
const routes = new RouteService(
  [new AdsbLolRouteProvider(), new AdsbdbRouteProvider()],
  staticIndex,
  logger,
);
const store = new StateStore((ac) => {
  recentTracks.record(ac);
  historyWriter?.append(ac);
});
const pool = new ProviderPool(providers);
const scheduler = new CoverageScheduler(worldCoverageGrid(), Date.now());
const worker = new IngestWorker(pool, scheduler, store, logger, {
  ...DEFAULT_INGEST_OPTIONS,
  evictAfterMs: config.EVICT_AFTER_SEC * 1000,
});
const hub = new StreamHub(
  logger,
  (viewports) => {
    scheduler.setDemand(viewports);
  },
  undefined,
  undefined,
  countryOfIcao24,
);
worker.onIndex((index, removed) => {
  recentTracks.forget(removed);
  hub.publish(index, removed);
});
const app = await buildApp({
  logger,
  store,
  worker,
  pool,
  scheduler,
  hub,
  staticIndex,
  routes,
  history,
  weather: new AviationWeather(),
  wind: new WindAloft(),
  retentionMs,
  historyStats: () => ({
    ...(historyWriter?.statistics ?? {}),
    recentAircraft: recentTracks.aircraftCount,
  }),
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

if (config.WEB_DIST !== undefined && (await serveWeb(app, config.WEB_DIST))) {
  logger.info({ dir: config.WEB_DIST }, 'serving web build');
}

if (config.INGEST_ENABLED) worker.start();
historyWriter?.start();
// Retention cron (SPEC § 6.1): every 10 minutes drop hours older than the window.
const purge = (): void => {
  void purgeHistory(config.HISTORY_DIR, Date.now() - retentionMs).then((deleted) => {
    if (deleted.length > 0) logger.info({ deleted: deleted.length }, 'history retention purge');
  });
};
purge();
const purgeTimer = setInterval(purge, 10 * 60_000);
hub.start();
await app.listen({ port: config.PORT, host: config.HOST });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info({ signal }, 'shutting down');
    hub.stop();
    clearInterval(purgeTimer);
    void worker
      .stop()
      .then(() => historyWriter?.stop())
      .then(() => app.close())
      .then(() => process.exit(0));
  });
}
