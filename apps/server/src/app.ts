import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeLiveStats, type LiveStats } from './api/live-stats.js';
import { overhead } from './api/overhead.js';
import { searchAircraft } from './api/search.js';
import { exportTrack, MIME, type TrackFormat } from './api/track-export.js';
import { airportTraffic } from './airport/airport-traffic.js';
import type { HistoryService } from './history/history-service.js';
import type { DensityGrid } from './state/density-grid.js';
import type { AviationWeather } from './weather/aviation-weather.js';
import { WIND_LEVELS, type WindAloft, type WindLevel } from './weather/wind-aloft.js';
import { RouteService } from './routes/route-service.js';
import type { CoverageScheduler } from './ingest/coverage-scheduler.js';
import type { IngestWorker } from './ingest/ingest-worker.js';
import type { ProviderPool } from './ingest/provider-pool.js';
import type { StateStore } from './state/state-store.js';
import { countryOfIcao24, type StaticIndex } from '@skytrace/static-data';
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
  readonly history: HistoryService;
  readonly density: DensityGrid;
  readonly weather: AviationWeather | null;
  readonly wind: WindAloft | null;
  /** How far back `/api/flights` looks, ms. */
  readonly retentionMs: number;
  readonly historyStats?: () => object;
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
const PlaybackQuery = z.object({
  bbox: z
    .string()
    .transform((s) => s.split(',').map(Number))
    .pipe(
      z.tuple([
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
      ]),
    ),
  from: z.coerce.number(),
  to: z.coerce.number(),
  spacing: z.coerce.number().int().min(5_000).max(300_000).default(20_000),
});
const HOUR_MS = 3_600_000;
const WindQuery = z.object({
  bbox: PlaybackQuery.shape.bbox,
  level: z.coerce
    .number()
    .refine((l): l is WindLevel => l in WIND_LEVELS, 'unsupported level')
    .default(250),
});
/** Playback windows are capped so one request cannot scan the whole archive. */
const MAX_PLAYBACK_MS = 2 * HOUR_MS;
const OverheadQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  elevationFt: z.coerce.number().min(-1400).max(30_000).default(0),
});
const HeatmapQuery = z.object({
  bbox: PlaybackQuery.shape.bbox,
  limit: z.coerce.number().int().min(100).max(20_000).default(8000),
});
const TrackFormatQuery = z.object({ format: z.enum(['kml', 'gpx']).optional() });
const CallsignParams = z.object({ callsign: z.string().min(2).max(8) });
const CodeParams = z.object({ code: z.string().regex(/^[A-Za-z0-9]{3,4}$/) });

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

  app.get('/api/track/:hex', async (req, reply) => {
    const params = HexParams.safeParse(req.params);
    const query = TrackQuery.safeParse(req.query);
    const wanted = TrackFormatQuery.safeParse(req.query);
    if (!params.success || !query.success || !wanted.success) {
      return reply.code(400).send({ error: 'invalid request' });
    }
    const hex = params.data.hex.toLowerCase();
    const to = query.data.to ?? now();
    const from = query.data.from ?? to - HOUR_MS;
    if (from > to) return reply.code(400).send({ error: 'from must be <= to' });
    const { points, raw } = await deps.history.track(hex, from, to);
    const format: TrackFormat | undefined = wanted.data.format;
    if (format === undefined) return { hex, points, raw };
    if (points.length === 0) return reply.code(404).send({ error: 'no recorded track' });
    const callsign = deps.store.get(hex)?.ac.callsign ?? null;
    const name = `${callsign ?? hex.toUpperCase()} ${new Date(from).toISOString().slice(0, 16)}Z`;
    return reply
      .type(MIME[format])
      .header('content-disposition', `attachment; filename="skytrace-${hex}.${format}"`)
      .send(exportTrack(points, format, name));
  });

  app.get('/api/heatmap', (req, reply) => {
    const q = HeatmapQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid request' });
    const cells = deps.density.query(q.data.bbox, q.data.limit, now());
    return {
      windowHours: 24,
      cellDeg: deps.density.cellDeg,
      max: cells.reduce((m, c) => Math.max(m, c.count), 0),
      cells,
    };
  });

  app.get('/api/overhead', (req, reply) => {
    const q = OverheadQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid request' });
    const { lat, lon, limit, elevationFt } = q.data;
    return {
      observer: { lat, lon, elevationFt },
      generatedAt: now(),
      aircraft: overhead(deps.worker.currentIndex, lat, lon, limit, undefined, elevationFt),
    };
  });

  app.get('/api/flights/:hex', async (req, reply) => {
    const params = HexParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid hex' });
    const t = now();
    const hex = params.data.hex.toLowerCase();
    return { hex, flights: await deps.history.flights(hex, t - deps.retentionMs, t) };
  });

  app.get('/api/history', async (req, reply) => {
    const q = PlaybackQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid request' });
    const { bbox, from, to, spacing } = q.data;
    if (from > to || to - from > MAX_PLAYBACK_MS) {
      return reply.code(400).send({ error: 'window must be positive and at most 2 h' });
    }
    const body = await deps.history.playback(bbox, from, to, spacing);
    return reply
      .type('application/octet-stream')
      .send(Buffer.from(body.buffer, body.byteOffset, body.byteLength));
  });

  app.get('/api/airport/:code', async (req, reply) => {
    const params = CodeParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid code' });
    const airport = deps.staticIndex?.airport(params.data.code) ?? null;
    if (airport === null) return reply.code(404).send({ error: 'not found' });
    const [metars, taf] =
      deps.weather === null
        ? [[], null]
        : await Promise.all([
            deps.weather.metars(airport.icao, 24),
            deps.weather.taf(airport.icao),
          ]);
    return {
      ...airport,
      metar: metars[0] ?? null,
      taf,
      // Last 24 h of surface wind for the wind rose.
      windHistory: metars
        .filter((m) => m.windDir !== null && m.windKt !== null)
        .map((m) => ({ t: m.observedAt, dir: m.windDir, kt: m.windKt })),
      traffic: airportTraffic(
        deps.worker.currentIndex,
        airport.lat,
        airport.lon,
        airport.elevationFt ?? 0,
      ),
    };
  });

  app.get('/api/wind', async (req, reply) => {
    const q = WindQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid request' });
    if (deps.wind === null) return reply.code(503).send({ error: 'wind unavailable' });
    const grid = await deps.wind.grid(q.data.bbox, q.data.level);
    if (grid === null) return reply.code(502).send({ error: 'upstream unavailable' });
    return grid;
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
      uptimeSec: Math.round(process.uptime()),
      aircraft: deps.store.size,
      peakAircraft: deps.store.peakSize,
      indexed: deps.worker.currentIndex.size,
      ingest: stats,
      stream: deps.hub.statistics,
      routesCached: deps.routes.size,
      history: deps.historyStats?.() ?? null,
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
