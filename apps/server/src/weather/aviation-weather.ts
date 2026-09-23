import { z } from 'zod';
import { USER_AGENT, type FetchFn } from '../ingest/provider.js';

const Cloud = z.looseObject({ cover: z.string(), base: z.number().nullish() });

const MetarSchema = z.looseObject({
  icaoId: z.string(),
  obsTime: z.number(),
  rawOb: z.string(),
  temp: z.number().nullish(),
  dewp: z.number().nullish(),
  wdir: z.union([z.number(), z.literal('VRB')]).nullish(),
  wspd: z.number().nullish(),
  wgst: z.number().nullish(),
  visib: z.union([z.number(), z.string()]).nullish(),
  altim: z.number().nullish(),
  fltCat: z.string().nullish(),
  clouds: z.array(Cloud).nullish(),
});

const TafSchema = z.looseObject({
  icaoId: z.string(),
  issueTime: z.string(),
  validTimeFrom: z.number(),
  validTimeTo: z.number(),
  rawTAF: z.string(),
});

export interface Metar {
  readonly station: string;
  /** Unix ms. */
  readonly observedAt: number;
  readonly raw: string;
  readonly tempC: number | null;
  readonly dewpointC: number | null;
  /** Degrees true; `null` when variable or calm. */
  readonly windDir: number | null;
  readonly windKt: number | null;
  readonly gustKt: number | null;
  readonly visibility: string | null;
  readonly qnhHpa: number | null;
  /** VFR / MVFR / IFR / LIFR. */
  readonly category: string | null;
  readonly clouds: readonly { cover: string; baseFt: number | null }[];
}

export interface Taf {
  readonly station: string;
  readonly issuedAt: number;
  readonly validFrom: number;
  readonly validTo: number;
  readonly raw: string;
}

function toMetar(m: z.infer<typeof MetarSchema>): Metar {
  return {
    station: m.icaoId,
    observedAt: m.obsTime * 1000,
    raw: m.rawOb,
    tempC: m.temp ?? null,
    dewpointC: m.dewp ?? null,
    windDir: typeof m.wdir === 'number' ? m.wdir : null,
    windKt: m.wspd ?? null,
    gustKt: m.wgst ?? null,
    visibility: m.visib === undefined || m.visib === null ? null : String(m.visib),
    qnhHpa: m.altim ?? null,
    category: m.fltCat ?? null,
    clouds: (m.clouds ?? []).map((c) => ({ cover: c.cover, baseFt: c.base ?? null })),
  };
}

const BASE = 'https://aviationweather.gov/api/data';

/**
 * NOAA Aviation Weather Center data API (SPEC § 1.5). Free, keyless; asks for
 * modest request rates, so results are cached (METAR 5 min, TAF 30 min).
 */
export class AviationWeather {
  private readonly cache = new Map<string, { at: number; value: unknown }>();

  constructor(
    private readonly fetchFn: FetchFn = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** METARs of the last `hours` hours, newest first. */
  async metars(icao: string, hours = 1): Promise<Metar[]> {
    const json = await this.get(
      `metar:${icao}:${hours}`,
      5 * 60_000,
      `${BASE}/metar?ids=${icao}&format=json&hours=${hours}`,
    );
    const parsed = z.array(z.unknown()).safeParse(json);
    if (!parsed.success) return [];
    return parsed.data
      .map((m) => MetarSchema.safeParse(m))
      .flatMap((r) => (r.success ? [toMetar(r.data)] : []))
      .sort((a, b) => b.observedAt - a.observedAt);
  }

  async taf(icao: string): Promise<Taf | null> {
    const json = await this.get(`taf:${icao}`, 30 * 60_000, `${BASE}/taf?ids=${icao}&format=json`);
    const parsed = z.array(TafSchema).safeParse(json);
    const t = parsed.success ? parsed.data[0] : undefined;
    if (t === undefined) return null;
    return {
      station: t.icaoId,
      issuedAt: Date.parse(t.issueTime),
      validFrom: t.validTimeFrom * 1000,
      validTo: t.validTimeTo * 1000,
      raw: t.rawTAF,
    };
  }

  private async get(key: string, ttlMs: number, url: string): Promise<unknown> {
    const hit = this.cache.get(key);
    if (hit !== undefined && this.now() - hit.at < ttlMs) return hit.value;
    try {
      const res = await this.fetchFn(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      // 204 = no data for this station, which is an answer worth caching.
      // Anything else upstream is a hiccup: keep whatever we had.
      if (!res.ok && res.status !== 204) return hit?.value ?? [];
      const value: unknown = res.status === 204 ? [] : await res.json();
      if (this.cache.size > 2000) this.cache.clear();
      this.cache.set(key, { at: this.now(), value });
      return value;
    } catch {
      return hit?.value ?? [];
    }
  }
}
