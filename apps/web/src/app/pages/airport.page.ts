import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { WindRoseComponent } from '../airport/wind-rose.component';
import { formatAltitude, formatVerticalRate } from '../core/format/format';
import { FETCH_FN } from '../core/live/aircraft-meta.service';
import { MapUiStore } from '../core/state/map-ui.store';

type Role = 'arrival' | 'departure' | 'ground' | 'overflight';

interface Traffic {
  readonly hex: string;
  readonly callsign: string | null;
  readonly typeCode: string | null;
  readonly role: Role;
  readonly distanceNm: number;
  readonly altitude: number | null;
  readonly gs: number | null;
  readonly baroRate: number | null;
}

interface AirportResponse {
  readonly icao: string;
  readonly iata: string | null;
  readonly name: string;
  readonly city: string | null;
  readonly country: string;
  readonly lat: number;
  readonly lon: number;
  readonly elevationFt: number | null;
  readonly metar: {
    readonly raw: string;
    readonly observedAt: number;
    readonly tempC: number | null;
    readonly dewpointC: number | null;
    readonly windDir: number | null;
    readonly windKt: number | null;
    readonly gustKt: number | null;
    readonly visibility: string | null;
    readonly qnhHpa: number | null;
    readonly category: string | null;
  } | null;
  readonly taf: {
    readonly raw: string;
    readonly validFrom: number;
    readonly validTo: number;
  } | null;
  readonly windHistory: readonly { readonly dir: number; readonly kt: number }[];
  readonly traffic: readonly Traffic[];
}

const REFRESH_MS = 15_000;
const TABS: readonly { id: Role; label: string }[] = [
  { id: 'arrival', label: $localize`:@@airport.tab.arrival:Arrivals` },
  { id: 'departure', label: $localize`:@@airport.tab.departure:Departures` },
  { id: 'ground', label: $localize`:@@airport.tab.ground:On ground` },
];

/** Airport page `/airport/{icao}` (SPEC § 5.3 screen 4). */
@Component({
  selector: 'st-airport-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, WindRoseComponent],
  templateUrl: './airport.page.html',
  styleUrl: './airport.page.css',
})
export class AirportPage {
  private readonly fetchFn = inject(FETCH_FN);
  private readonly router = inject(Router);
  private readonly store = inject(MapUiStore);
  protected readonly code = (
    inject(ActivatedRoute).snapshot.paramMap.get('icao') ?? ''
  ).toUpperCase();
  protected readonly data = signal<AirportResponse | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'missing'>('loading');
  protected readonly tab = signal<Role>('arrival');
  protected readonly tabs = TABS;

  constructor() {
    void this.load();
    const timer = setInterval(() => void this.load(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
    });
  }

  protected readonly counts = computed(() => {
    const c: Record<Role, number> = { arrival: 0, departure: 0, ground: 0, overflight: 0 };
    for (const t of this.data()?.traffic ?? []) c[t.role]++;
    return c;
  });

  protected readonly rows = computed(() =>
    (this.data()?.traffic ?? [])
      .filter((t) => t.role === this.tab())
      .map((t) => ({
        hex: t.hex,
        title: t.callsign ?? t.hex.toUpperCase(),
        type: t.typeCode ?? '—',
        dist: `${t.distanceNm.toFixed(1)} nm`,
        alt: formatAltitude(t.altitude, t.altitude === 0),
        vr: formatVerticalRate(t.baroRate),
      })),
  );

  protected readonly wind = computed(() => {
    const m = this.data()?.metar ?? null;
    if (m?.windKt == null) return '—';
    const dir = m.windDir === null ? 'VRB' : `${String(m.windDir).padStart(3, '0')}°`;
    return `${dir} ${m.windKt} kt${m.gustKt === null ? '' : ` G${m.gustKt}`}`;
  });

  protected readonly observed = computed(() => {
    const m = this.data()?.metar;
    return m === null || m === undefined
      ? ''
      : new Date(m.observedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  });

  protected open(hex: string): void {
    const a = this.data();
    if (a !== null) this.store.flyTo(a.lat, a.lon, 9);
    this.store.select(hex);
    void this.router.navigate(['/']);
  }

  protected showOnMap(): void {
    const a = this.data();
    if (a === null) return;
    this.store.flyTo(a.lat, a.lon, 10);
    void this.router.navigate(['/']);
  }

  private async load(): Promise<void> {
    try {
      const res = await this.fetchFn(`/api/airport/${encodeURIComponent(this.code)}`);
      if (res.status === 404) {
        this.state.set('missing');
        return;
      }
      if (!res.ok) return;
      this.data.set((await res.json()) as AirportResponse);
      this.state.set('ready');
    } catch {
      // Keep the last good data on transient failures.
    }
  }
}
