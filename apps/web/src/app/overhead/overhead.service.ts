import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { compassPoint } from '@skytrace/geo';
import { FETCH_FN } from '../core/live/aircraft-meta.service';

export interface OverheadAircraft {
  readonly hex: string;
  readonly callsign: string | null;
  readonly registration: string | null;
  readonly typeCode: string | null;
  readonly altitude: number | null;
  readonly gs: number | null;
  readonly track: number | null;
  readonly lat: number;
  readonly lon: number;
  readonly azimuth: number;
  readonly elevation: number;
  readonly slantRangeNm: number;
  readonly groundRangeNm: number;
}

export type LocationState = 'idle' | 'locating' | 'denied' | 'unavailable' | 'ready';

const REFRESH_MS = 5000;

/**
 * "What's above me" (SPEC phase 8): the browser's position plus the server's
 * view of what is in the sky there, ranked by how high it stands above the
 * horizon.
 */
@Injectable({ providedIn: 'root' })
export class OverheadService {
  private readonly fetchFn = inject(FETCH_FN);
  readonly state = signal<LocationState>('idle');
  readonly position = signal<{ lat: number; lon: number; accuracyM: number } | null>(null);
  readonly aircraft = signal<readonly OverheadAircraft[]>([]);
  readonly updatedAt = signal<number | null>(null);
  readonly top = computed(() => this.aircraft()[0] ?? null);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stop();
    });
  }

  /** Asks for the position once, then polls the server while the page is open. */
  start(): void {
    // Typed as always present, but absent in insecure contexts and in tests.
    const geo = (navigator as { geolocation?: Geolocation }).geolocation;
    if (geo === undefined) {
      this.state.set('unavailable');
      return;
    }
    this.state.set('locating');
    geo.getCurrentPosition(
      (pos) => {
        this.position.set({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: Math.round(pos.coords.accuracy),
        });
        this.state.set('ready');
        void this.refresh();
        this.timer ??= setInterval(() => void this.refresh(), REFRESH_MS);
      },
      (err) => {
        this.state.set(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Uses a point picked on the map instead of the device position. */
  useManual(lat: number, lon: number): void {
    this.position.set({ lat, lon, accuracyM: 0 });
    this.state.set('ready');
    void this.refresh();
    this.timer ??= setInterval(() => void this.refresh(), REFRESH_MS);
  }

  private async refresh(): Promise<void> {
    const p = this.position();
    if (p === null) return;
    const params = new URLSearchParams({
      lat: p.lat.toFixed(5),
      lon: p.lon.toFixed(5),
      limit: '8',
    });
    try {
      const res = await this.fetchFn(`/api/overhead?${params.toString()}`);
      if (!res.ok) return;
      const body = (await res.json()) as { aircraft: OverheadAircraft[]; generatedAt: number };
      this.aircraft.set(body.aircraft);
      this.updatedAt.set(body.generatedAt);
    } catch {
      // Keep the last answer; the next tick tries again.
    }
  }
}

/** `200° SSW` for a readable bearing. */
export function bearingLabel(azimuth: number): string {
  return `${Math.round(azimuth)}° ${compassPoint(azimuth)}`;
}
