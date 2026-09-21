import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeLiveStats, type LiveStats } from './api/live-stats.js';
import { searchAircraft } from './api/search.js';
import type { TrackHistory } from './history/track-history.js';
import { RouteService } from './routes/route-service.js';
import type { CoverageScheduler } from './ingest/coverage-scheduler.js';
import type { IngestWorker } from './ingest/ingest-worker.js';
import type { ProviderPool } from './ingest/provider-pool.js';
import type { StateStore } from './state/state-store.js';
import { countryOfIcao24, type StaticIndex } from '@skytrace/static-data';
import { simplifyRdp } from '@skytrace/geo';
import type { StreamHub } from './stream/stream-hub.js';

export interface AppDeps {
  readonly logger: FastifyBaseLogger | false;
  readonly store: StateStore;
  readonly worker: IngestWorker;
  readonly pool: ProviderPool;
  readonly scheduler: CoverageScheduler;
  readonly hub: StreamHub;
  readonly staticIndex: StaticIndex | null;
  readonly routes: RouteService;
  readonly history: TrackHistory;
  readonly corsOrigin: string;
  /** Max concurrent WebSocket connections per IP. */
  readonly maxConnectionsPerIp?: number;
  readonly now?: () => number;
}

const HexParams = z.object({ hex: z.string().regex(/^~?[0-9a-fA-F]{6}$/) });
const SearchQuery = z.object({
  q: z.string().min(1).max(40),
  kind: z.enum(['all', 'flights', 'airports', 'airlines']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const TrackQuery = z.object({
  from: z.coerce.number().optional(),
  to: z.coerce.number().optional(),
});
const CallsignParams = z.object({ callsign: z.string().min(2).max(8) });
const CodeParams = z.object({ code: z.string().regex(/^[A-Za-z0-9]{3,4}$/) });
/** SPEC § 6.2 simplification tolerance, degrees. */
const RDP_EPSILON = 0.0005;
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
    const ac = entry.ac;
    const idx = deps.staticIndex;
    return {
      ...ac,
      country: countryOfIcao24(ac.hex),
      airline: idx?.airlineOfCallsign(ac.callsign) ?? null,
      aircraftType: idx?.aircraftType(ac.typeCode) ?? null,
    };
  });

  app.get('/api/search', (req, reply) => {
    const query = SearchQuery.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid query' });
    const { q, kind, limit } = query.data;
    const idx = deps.staticIndex;
    const flights =
      kind === 'all' || kind === 'flights'
        ? searchAircraft(
            [...deps.store.values()].map((s) => s.ac),
            q,
            limit,
          )
        : [];
    const airports =
      (kind === 'all' || kind === 'airports') && idx !== null
        ? idx
            .searchAirports(q, limit)
            .map(({ airport }) => ({ ...airport, size: airport.kind, kind: 'airport' as const }))
        : [];
    const airline =
      (kind === 'all' || kind === 'airlines') && idx !== null ? idx.airline(q.trim()) : null;
    const airlines = airline === null ? [] : [{ kind: 'airline' as const, ...airline }];
    return {
      results: [...flights, ...airlines, ...airports].slice(0, kind === 'all' ? limit : undefined),
    };
  });

  app.get('/api/route/:callsign', async (req, reply) => {
    const params = CallsignParams.safeParse(req.params);
    const callsign = params.success ? params.data.callsign.toUpperCase() : '';
    if (!RouteService.isValidCallsign(callsign))
      return reply.code(400).send({ error: 'invalid callsign' });
    const route = await deps.routes.lookup(callsign);
    if (route === null) return reply.code(404).send({ error: 'route unknown' });
    return route;
  });

  app.get('/api/track/:hex', (req, reply) => {
    const params = HexParams.safeParse(req.params);
    const query = TrackQuery.safeParse(req.query);
    if (!params.success || !query.success)
      return reply.code(400).send({ error: 'invalid request' });
    const hex = params.data.hex.toLowerCase();
    const points = deps.history.get(hex, query.data.from, query.data.to);
    const simplified = simplifyRdp(points, RDP_EPSILON, (p) => [p.lon, p.lat]);
    return { hex, points: simplified, raw: points.length };
  });

  app.get('/api/airport/:code', (req, reply) => {
    const params = CodeParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid code' });
    const airport = deps.staticIndex?.airport(params.data.code) ?? null;
    if (airport === null) return reply.code(404).send({ error: 'not found' });
    return airport;
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
      routesCached: deps.routes.size,
      historyAircraft: deps.history.aircraftCount,
      staticData: deps.staticIndex !== null,
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
