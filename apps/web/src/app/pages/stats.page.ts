import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { formatCount } from '../core/format/format';
import { FETCH_FN } from '../core/live/aircraft-meta.service';
import { MapUiStore } from '../core/state/map-ui.store';
import { StreamClient } from '../core/live/stream-client.service';

interface LiveStats {
  readonly generatedAt: number;
  readonly total: number;
  readonly airborne: number;
  readonly onGround: number;
  readonly military: number;
  readonly emergencies: readonly {
    hex: string;
    callsign: string | null;
    squawk: string | null;
    kind: string;
  }[];
  readonly altitudeBands: readonly (readonly [number, number])[];
  readonly topOperators: readonly (readonly [string, number])[];
  readonly topTypes: readonly (readonly [string, number])[];
}

/** SPEC § 5.3 screen 7: refreshed every 10 s. */
const REFRESH_MS = 10_000;

/** Live dashboard (SPEC § 5.3 screen 7). */
@Component({
  selector: 'st-stats-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stats.page.html',
  styleUrl: './stats.page.css',
})
export class StatsPage {
  private readonly fetchFn = inject(FETCH_FN);
  private readonly router = inject(Router);
  private readonly store = inject(MapUiStore);
  private readonly client = inject(StreamClient);
  protected readonly stats = signal<LiveStats | null>(null);

  constructor() {
    void this.load();
    const timer = setInterval(() => void this.load(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
    });
  }

  protected readonly tiles = computed(() => {
    const s = this.stats();
    if (s === null) return [];
    return [
      { id: 'Tracked', label: $localize`:@@stats.tracked:Tracked`, value: formatCount(s.total) },
      {
        id: 'Airborne',
        label: $localize`:@@stats.airborne:Airborne`,
        value: formatCount(s.airborne),
      },
      {
        id: 'On ground',
        label: $localize`:@@stats.ground:On ground`,
        value: formatCount(s.onGround),
      },
      {
        id: 'Military',
        label: $localize`:@@stats.military:Military`,
        value: formatCount(s.military),
      },
    ];
  });

  protected readonly bands = computed(() => {
    const s = this.stats();
    if (s === null) return [];
    const max = Math.max(1, ...s.altitudeBands.map(([, n]) => n));
    return s.altitudeBands.map(([ft, n]) => ({
      label: ft >= 45_000 ? 'FL450+' : `FL${String(ft / 100).padStart(3, '0')}`,
      n,
      pct: (n / max) * 100,
    }));
  });

  protected readonly operators = computed(() => this.ranked(this.stats()?.topOperators ?? []));
  protected readonly types = computed(() => this.ranked(this.stats()?.topTypes ?? []));
  protected readonly updated = computed(() => {
    const s = this.stats();
    return s === null ? '' : new Date(s.generatedAt).toLocaleTimeString('en-GB');
  });

  protected openEmergency(hex: string): void {
    const ac = this.client.registry.aircraft.get(hex);
    if (ac !== undefined) this.store.flyTo(ac.record.lat, ac.record.lon, 8);
    this.store.select(hex);
    void this.router.navigate(['/']);
  }

  private ranked(
    list: readonly (readonly [string, number])[],
  ): { key: string; n: number; pct: number }[] {
    const max = Math.max(1, ...list.map(([, n]) => n));
    return list.map(([key, n]) => ({ key, n, pct: (n / max) * 100 }));
  }

  private async load(): Promise<void> {
    try {
      const res = await this.fetchFn('/api/stats');
      if (res.ok) this.stats.set((await res.json()) as LiveStats);
    } catch {
      // Keep the last snapshot on transient failures.
    }
  }
}
