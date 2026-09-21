import { inject, Injectable, InjectionToken, signal, type Signal } from '@angular/core';
import type { Aircraft } from '@skytrace/adsb-types';
import { del, get, set } from 'idb-keyval';

/** Static fields the position stream deliberately omits (SPEC § 4.2). */
export interface AircraftMeta {
  readonly hex: string;
  readonly callsign: string | null;
  readonly registration: string | null;
  readonly typeCode: string | null;
  readonly fetchedAt: number;
}

/** Injected so tests can stub the network. */
export const FETCH_FN = new InjectionToken<typeof fetch>('FETCH_FN', {
  providedIn: 'root',
  factory: () => globalThis.fetch.bind(globalThis),
});

const STORE_PREFIX = 'ac:';
/** Registrations change rarely; a week is plenty and keeps the cache small. */
const TTL_MS = 7 * 24 * 3600_000;

/**
 * Lazily fetches `/api/ac/{hex}` and caches it in memory and IndexedDB, so a
 * callsign is fetched once per aircraft per browser.
 */
@Injectable({ providedIn: 'root' })
export class AircraftMetaService {
  private readonly memory = new Map<string, ReturnType<typeof signal<AircraftMeta | null>>>();
  private readonly inFlight = new Set<string>();

  private readonly fetchFn = inject(FETCH_FN);
  private readonly now = Date.now;

  /** Signal that fills in once the metadata arrives. */
  meta(hex: string): Signal<AircraftMeta | null> {
    const existing = this.memory.get(hex);
    if (existing !== undefined) return existing.asReadonly();
    const s = signal<AircraftMeta | null>(null);
    this.memory.set(hex, s);
    void this.load(hex, s);
    return s.asReadonly();
  }

  private async load(
    hex: string,
    s: ReturnType<typeof signal<AircraftMeta | null>>,
  ): Promise<void> {
    if (this.inFlight.has(hex)) return;
    this.inFlight.add(hex);
    try {
      const cached = await get<AircraftMeta>(STORE_PREFIX + hex).catch(() => undefined);
      if (cached !== undefined && this.now() - cached.fetchedAt < TTL_MS) {
        s.set(cached);
        return;
      }
      if (cached !== undefined) await del(STORE_PREFIX + hex).catch(() => undefined);
      const res = await this.fetchFn(`/api/ac/${encodeURIComponent(hex)}`);
      if (!res.ok) return;
      const ac = (await res.json()) as Aircraft;
      const meta: AircraftMeta = {
        hex: ac.hex,
        callsign: ac.callsign,
        registration: ac.registration,
        typeCode: ac.typeCode,
        fetchedAt: this.now(),
      };
      s.set(meta);
      await set(STORE_PREFIX + hex, meta).catch(() => undefined);
    } catch {
      // Offline or 404: the UI falls back to the hex address.
    } finally {
      this.inFlight.delete(hex);
    }
  }
}
