import type { StaticIndex } from '@skytrace/static-data';
import type { Logger } from '../logger.js';
import type { FlightRoute } from './route.js';
import { canonicalizeRoute, type RouteProvider } from './route-providers.js';

export interface RouteServiceOptions {
  /** Routes change with schedules, not minute to minute. */
  readonly hitTtlMs: number;
  readonly missTtlMs: number;
  readonly maxEntries: number;
}

export const DEFAULT_ROUTE_OPTIONS: RouteServiceOptions = {
  hitTtlMs: 6 * 3600_000,
  missTtlMs: 30 * 60_000,
  maxEntries: 20_000,
};

const CALLSIGN = /^[A-Z0-9]{2,8}$/;

/**
 * Callsign → route with a provider chain and a bounded TTL cache. Concurrent
 * lookups for the same callsign share one request.
 */
export class RouteService {
  private readonly cache = new Map<string, { at: number; route: FlightRoute | null }>();
  private readonly pending = new Map<string, Promise<FlightRoute | null>>();

  constructor(
    private readonly providers: readonly RouteProvider[],
    private readonly index: StaticIndex | null,
    private readonly log: Logger,
    private readonly opts: RouteServiceOptions = DEFAULT_ROUTE_OPTIONS,
    private readonly now: () => number = Date.now,
  ) {}

  static isValidCallsign(callsign: string): boolean {
    return CALLSIGN.test(callsign);
  }

  async lookup(
    rawCallsign: string,
    lat: number | null = null,
    lon: number | null = null,
  ): Promise<FlightRoute | null> {
    const callsign = rawCallsign.trim().toUpperCase();
    if (!RouteService.isValidCallsign(callsign)) return null;
    const hit = this.cache.get(callsign);
    if (hit !== undefined) {
      const ttl = hit.route === null ? this.opts.missTtlMs : this.opts.hitTtlMs;
      if (this.now() - hit.at < ttl) return hit.route;
      this.cache.delete(callsign);
    }
    const inFlight = this.pending.get(callsign);
    if (inFlight !== undefined) return inFlight;
    const p = this.resolve(callsign, lat, lon).finally(() => this.pending.delete(callsign));
    this.pending.set(callsign, p);
    return p;
  }

  get size(): number {
    return this.cache.size;
  }

  private async resolve(
    callsign: string,
    lat: number | null,
    lon: number | null,
  ): Promise<FlightRoute | null> {
    let route: FlightRoute | null = null;
    let transportFailures = 0;
    for (const provider of this.providers) {
      try {
        route = await provider.lookup(callsign, lat, lon);
        if (route !== null) break;
      } catch (err) {
        transportFailures++;
        this.log.debug(
          { provider: provider.id, callsign, err: String(err) },
          'route lookup failed',
        );
      }
    }
    // Do not cache "unknown" when every provider was unreachable.
    if (route === null && transportFailures === this.providers.length) return null;
    const result = route === null ? null : canonicalizeRoute(route, this.index);
    this.remember(callsign, result);
    return result;
  }

  private remember(callsign: string, route: FlightRoute | null): void {
    if (this.cache.size >= this.opts.maxEntries) {
      // Maps iterate in insertion order: the first key is the oldest entry.
      const oldest = this.cache.keys().next();
      if (oldest.done !== true) this.cache.delete(oldest.value);
    }
    this.cache.set(callsign, { at: this.now(), route });
  }
}
