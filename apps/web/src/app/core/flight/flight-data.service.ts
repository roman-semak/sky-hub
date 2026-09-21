import { inject, Injectable, signal, type Signal } from '@angular/core';
import { FETCH_FN } from '../live/aircraft-meta.service';
import type { FlightRoute, TrackResponse } from '../api/api-types';

export type Loadable<T> =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly value: T }
  | { readonly state: 'missing' };

/** Route and recent-track lookups for the detail panel, cached per session. */
@Injectable({ providedIn: 'root' })
export class FlightDataService {
  private readonly fetchFn = inject(FETCH_FN);
  private readonly routes = new Map<string, ReturnType<typeof signal<Loadable<FlightRoute>>>>();

  route(callsign: string): Signal<Loadable<FlightRoute>> {
    const key = callsign.toUpperCase();
    const cached = this.routes.get(key);
    if (cached !== undefined) return cached.asReadonly();
    const s = signal<Loadable<FlightRoute>>({ state: 'loading' });
    this.routes.set(key, s);
    void this.getJson<FlightRoute>(`/api/route/${encodeURIComponent(key)}`).then((route) => {
      s.set(route === null ? { state: 'missing' } : { state: 'ready', value: route });
    });
    return s.asReadonly();
  }

  /** Recent track; not cached because it grows while the aircraft flies. */
  track(hex: string): Promise<TrackResponse | null> {
    return this.getJson<TrackResponse>(`/api/track/${encodeURIComponent(hex)}`);
  }

  private async getJson<T>(url: string): Promise<T | null> {
    try {
      const res = await this.fetchFn(url);
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      return null;
    }
  }
}
