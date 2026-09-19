import { parseAdsbResponse } from '@skytrace/adsb-types';
import type { CoverageCircle } from '@skytrace/geo';
import { USER_AGENT, type FetchFn, type Provider, type ProviderOutcome } from './provider.js';

export interface AdsbV2ProviderConfig {
  readonly id: string;
  /** Builds the request URL for a circle; mirrors disagree on the path shape. */
  readonly url: (lat: number, lon: number, radiusNm: number) => string;
  readonly minIntervalMs: number;
  readonly timeoutMs?: number;
}

const MAX_RADIUS_NM = 250;

/** Provider for readsb-compatible `/v2` APIs (adsb.lol and its mirrors). */
export class AdsbV2Provider implements Provider {
  readonly id: string;
  readonly minIntervalMs: number;
  readonly fallbackOnly = false;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: AdsbV2ProviderConfig,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    this.id = config.id;
    this.minIntervalMs = config.minIntervalMs;
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  async fetchCircle(circle: CoverageCircle, signal: AbortSignal): Promise<ProviderOutcome> {
    const radius = Math.min(MAX_RADIUS_NM, Math.round(circle.radiusNm));
    const url = this.config.url(circle.lat, circle.lon, radius);
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]),
      });
    } catch (err) {
      return {
        kind: 'error',
        status: null,
        message: err instanceof Error ? err.message : String(err),
      };
    }
    if (res.status === 429 || res.status === 420) {
      await res.body?.cancel();
      return { kind: 'rate-limited', status: res.status };
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { kind: 'error', status: res.status, message: `HTTP ${res.status}` };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      return { kind: 'error', status: res.status, message: `invalid JSON: ${String(err)}` };
    }
    const parsed = parseAdsbResponse(body);
    if (!parsed.ok) return { kind: 'error', status: res.status, message: parsed.error };
    return { kind: 'ok', aircraft: parsed.value.aircraft, invalid: parsed.value.invalid };
  }
}

const fmt = (n: number): string => n.toFixed(3);

/** Known `/v2` mirrors (SPEC § 1.1–1.2). Availability is decided in config. */
export const ADSB_V2_MIRRORS = {
  'adsb.lol': (lat: number, lon: number, nm: number) =>
    `https://api.adsb.lol/v2/lat/${fmt(lat)}/lon/${fmt(lon)}/dist/${nm}`,
  'adsb.fi': (lat: number, lon: number, nm: number) =>
    `https://opendata.adsb.fi/api/v2/lat/${fmt(lat)}/lon/${fmt(lon)}/dist/${nm}`,
  'airplanes.live': (lat: number, lon: number, nm: number) =>
    `https://api.airplanes.live/v2/point/${fmt(lat)}/${fmt(lon)}/${nm}`,
  'adsb.one': (lat: number, lon: number, nm: number) =>
    `https://api.adsb.one/v2/point/${fmt(lat)}/${fmt(lon)}/${nm}`,
} as const;

export type AdsbV2MirrorId = keyof typeof ADSB_V2_MIRRORS;
