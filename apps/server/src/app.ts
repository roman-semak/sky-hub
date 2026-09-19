import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeLiveStats, type LiveStats } from './api/live-stats.js';
import { searchAircraft } from './api/search.js';
import type { CoverageScheduler } from './ingest/coverage-scheduler.js';
import type { IngestWorker } from './ingest/ingest-worker.js';
import type { ProviderPool } from './ingest/provider-pool.js';
import type { StateStore } from './state/state-store.js';
import type { StreamHub } from './stream/stream-hub.js';

export interface AppDeps {
  readonly logger: FastifyBaseLogger | false;
  readonly store: StateStore;
  readonly worker: IngestWorker;
  readonly pool: ProviderPool;
  readonly scheduler: CoverageScheduler;
  readonly hub: StreamHub;
  readonly corsOrigin: string;
  /** Max concurrent WebSocket connections per IP. */
  readonly maxConnectionsPerIp?: number;
  readonly now?: () => number;
}

const HexParams = z.object({ hex: z.string().regex(/^~?[0-9a-fA-F]{6}$/) });
const SearchQuery = z.object({
  q: z.string().min(1).max(40),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const STATS_TTL_MS = 10_000;

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const now = deps.now ?? Date.now;
  const app: FastifyInstance =
    deps.logger === false ? Fastify({ logger: false }) : Fastify({ loggerInstance: deps.logger });

  app.addHook('onSend', (_req, reply, payload, done) => {
    reply.header('access-control-allow-origin', deps.corsOrigin);
    done(null, payload);
  });

  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(websocket, {
    options: { perMessageDeflate: { threshold: 256 }, maxPayload: 16 * 1024 },
  });

  const perIp = new Map<string, number>();
  const maxPerIp = deps.maxConnectionsPerIp ?? 10;

  app.get('/stream', { websocket: true, config: { rateLimit: false } }, (socket, req) => {
    const ip = req.ip;
    const open = perIp.get(ip) ?? 0;
    if (open >= maxPerIp) {
      socket.close(1008, 'too many connections');
      return;
    }
    perIp.set(ip, open + 1);
    const handlers = deps.hub.connect(socket);
    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      const text = Array.isArray(data)
        ? Buffer.concat(data).toString('utf8')
        : data instanceof ArrayBuffer
          ? Buffer.from(data).toString('utf8')
          : data.toString('utf8');
      handlers.onMessage(text);
    });
    socket.on('close', () => {
      handlers.onClose();
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n <= 0) perIp.delete(ip);
      else perIp.set(ip, n);
    });
  });

  app.get('/api/ac/:hex', (req, reply) => {
    const params = HexParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid hex' });
    const entry = deps.store.get(params.data.hex.toLowerCase());
    if (entry === undefined) return reply.code(404).send({ error: 'not found' });
    return entry.ac;
  });

  app.get('/api/search', (req, reply) => {
    const query = SearchQuery.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid query' });
    const list = [...deps.store.values()].map((s) => s.ac);
    return { results: searchAircraft(list, query.data.q, query.data.limit) };
  });

  let statsCache: LiveStats | null = null;
  app.get('/api/stats', () => {
    const t = now();
    if (statsCache === null || t - statsCache.generatedAt >= STATS_TTL_MS) {
      statsCache = computeLiveStats(
        [...deps.store.values()].map((s) => s.ac),
        t,
      );
    }
    return statsCache;
  });

  app.get('/healthz', { config: { rateLimit: false } }, () => {
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
      stream: deps.hub.statistics,
      scheduler: deps.scheduler.snapshot(t),
      providers: deps.pool.snapshot(t),
      memory: {
        heapUsedMb: Math.round(mem.heapUsed / 1048576),
        rssMb: Math.round(mem.rss / 1048576),
      },
    };
  });

  return app;
}
