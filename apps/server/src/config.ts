import { z } from 'zod';
import { ADSB_V2_MIRRORS, type AdsbV2MirrorId } from './ingest/adsb-v2-provider.js';

const mirrorIds = Object.keys(ADSB_V2_MIRRORS) as [AdsbV2MirrorId, ...AdsbV2MirrorId[]];

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /**
   * Comma-separated `/v2` mirrors in priority order. airplanes.live and
   * adsb.one are off by default: both reject anonymous clients (ADR-002).
   */
  PROVIDERS: z
    .string()
    .default('adsb.fi,adsb.lol')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x !== ''),
    )
    .pipe(z.array(z.enum(mirrorIds)).min(1)),
  OPENSKY_ENABLED: bool.default(true),
  INGEST_ENABLED: bool.default(true),
  EVICT_AFTER_SEC: z.coerce.number().positive().default(180),
  STATIC_DATA_PATH: z.string().default('../../data/static/datasets.json.zst'),
  HISTORY_ENABLED: bool.default(true),
  HISTORY_DIR: z.string().default('../../data/history'),
  /** SPEC § 6.1: flush every 5 minutes. */
  HISTORY_FLUSH_SEC: z.coerce.number().positive().default(300),
  HISTORY_RETENTION_HOURS: z.coerce.number().positive().default(72),
  CORS_ORIGIN: z.string().default('*'),
  /** Serve the Angular production build from this directory (optional). */
  WEB_DIST: z.string().optional(),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}

/** Healthy pacing per mirror, measured against the live APIs (ADR-002). */
export const MIRROR_MIN_INTERVAL_MS: Readonly<Record<AdsbV2MirrorId, number>> = {
  'adsb.fi': 1100,
  'adsb.lol': 6000,
  'airplanes.live': 1000,
  'adsb.one': 1000,
};
