import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { CoverageScheduler } from './ingest/coverage-scheduler.js';
import type { IngestWorker } from './ingest/ingest-worker.js';
import type { ProviderPool } from './ingest/provider-pool.js';
import type { StateStore } from './state/state-store.js';

export interface AppDeps {
  readonly logger: FastifyBaseLogger | false;
  readonly store: StateStore;
  readonly worker: IngestWorker;
  readonly pool: ProviderPool;
  readonly scheduler: CoverageScheduler;
  readonly corsOrigin: string;
  readonly now?: () => number;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const now = deps.now ?? Date.now;
  const app: FastifyInstance =
    deps.logger === false ? Fastify({ logger: false }) : Fastify({ loggerInstance: deps.logger });

  app.addHook('onSend', (_req, reply, payload, done) => {
    reply.header('access-control-allow-origin', deps.corsOrigin);
    done(null, payload);
  });

  app.get('/healthz', () => {
    const t = now();
    const mem = process.memoryUsage();
    const stats = deps.worker.statistics;
    return {
      status: 'ok',
      uptimeSec: Math.round((t - stats.startedAt) / 1000),
      aircraft: deps.store.size,
      peakAircraft: deps.store.peakSize,
      indexed: deps.worker.currentIndex.size,
      ingest: stats,
      scheduler: deps.scheduler.snapshot(t),
      providers: deps.pool.snapshot(t),
      memory: {
        heapUsedMb: Math.round(mem.heapUsed / 1048576),
        rssMb: Math.round(mem.rss / 1048576),
      },
    };
  });

  await Promise.resolve();
  return app;
}
