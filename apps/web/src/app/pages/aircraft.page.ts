import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FETCH_FN, AircraftMetaService } from '../core/live/aircraft-meta.service';
import { formatAltitude } from '../core/format/format';
import { MapUiStore } from '../core/state/map-ui.store';
import type { SearchResult } from '../core/api/api-types';

interface FlightSegment {
  readonly start: number;
  readonly end: number;
  readonly points: number;
  readonly maxAlt: number | null;
  readonly to: { readonly lat: number; readonly lon: number };
}

const HEX = /^~?[0-9a-f]{6}$/;
const dateTime = (ms: number): string =>
  new Date(ms).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Aircraft page (SPEC § 5.3 screen 5): `/aircraft/{hex}` or `/aircraft/{reg}`,
 * flights recorded within the history retention window.
 */
@Component({
  selector: 'st-aircraft-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="page" aria-labelledby="ac-title">
      <a routerLink="/" class="back" i18n="@@aircraft.map">← Map</a>
      @switch (state()) {
        @case ('loading') {
          <p class="muted" role="status" i18n="@@aircraft.looking">Looking up {{ id }}…</p>
        }
        @case ('missing') {
          <h1 id="ac-title">{{ id }}</h1>
          <p class="muted" i18n="@@aircraft.thisAircraftIsNotLive">
            This aircraft is not live and has no recorded history.
          </p>
        }
        @default {
          <header>
            <h1 id="ac-title">{{ title() }}</h1>
            <p class="muted">{{ sub() }}</p>
          </header>
          <h2 class="eyebrow" i18n="@@aircraft.recordedFlights">Recorded flights</h2>
          <ul class="flights">
            @for (f of rows(); track f.start) {
              <li>
                <button type="button" (click)="showOnMap(f.lat, f.lon)">
                  <span class="when">{{ f.when }}</span>
                  <span class="meta tabular" i18n="@@aircraft.flightMeta"
                    >{{ f.duration }} · max {{ f.alt }} · {{ f.points }} fixes</span
                  >
                </button>
              </li>
            } @empty {
              <li class="muted" i18n="@@aircraft.noFlightsInTheHistory">
                No flights in the history window yet.
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
  styles: `
    .page {
      height: 100%;
      overflow-y: auto;
      padding: 22px 18px 96px;
      max-width: 640px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .back {
      font-size: 13px;
    }
    h1 {
      margin: 0;
      font-family: var(--font-heading);
      font-weight: 500;
      font-size: 28px;
    }
    .muted,
    .meta {
      color: var(--color-neutral-400);
      font-size: 13px;
    }
    header p {
      margin: 4px 0 0;
    }
    h2 {
      margin: 8px 0 0;
      font-weight: 400;
    }
    .flights {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .flights button {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
      padding: 12px 0;
      border-top: 1px solid rgba(var(--ink), 0.08);
      text-align: left;
    }
    .when {
      font-size: 14px;
      font-weight: 600;
    }
  `,
})
export class AircraftPage {
  private readonly fetchFn = inject(FETCH_FN);
  private readonly metaService = inject(AircraftMetaService);
  private readonly store = inject(MapUiStore);
  private readonly router = inject(Router);
  protected readonly id = (inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '').trim();
  protected readonly state = signal<'loading' | 'ready' | 'missing'>('loading');
  private readonly hex = signal<string | null>(null);
  protected readonly flights = signal<FlightSegment[]>([]);

  constructor() {
    void this.load();
  }

  private readonly meta = computed(() => {
    const hex = this.hex();
    return hex === null ? null : this.metaService.meta(hex)();
  });

  protected readonly title = computed(() => this.meta()?.registration ?? this.id.toUpperCase());
  protected readonly sub = computed(() => {
    const m = this.meta();
    return [m?.typeName ?? m?.typeCode, m?.airline, this.hex()?.toUpperCase()]
      .filter(Boolean)
      .join(' · ');
  });

  protected readonly rows = computed(() =>
    this.flights().map((f) => {
      const minutes = Math.max(1, Math.round((f.end - f.start) / 60_000));
      return {
        start: f.start,
        when: `${dateTime(f.start)} → ${dateTime(f.end)}`,
        duration:
          minutes >= 60
            ? $localize`:@@aircraft.hoursMinutes:${Math.floor(minutes / 60)}:h: h ${minutes % 60}:m: min`
            : $localize`:@@aircraft.minutes:${minutes}:m: min`,
        alt: formatAltitude(f.maxAlt, f.maxAlt === 0),
        points: f.points,
        lat: f.to.lat,
        lon: f.to.lon,
      };
    }),
  );

  protected showOnMap(lat: number, lon: number): void {
    const hex = this.hex();
    this.store.flyTo(lat, lon, 8);
    if (hex !== null) this.store.select(hex);
    void this.router.navigate(['/']);
  }

  private async load(): Promise<void> {
    const hex = HEX.test(this.id.toLowerCase())
      ? this.id.toLowerCase()
      : await this.resolveRegistration(this.id);
    if (hex === null) {
      this.state.set('missing');
      return;
    }
    this.hex.set(hex);
    try {
      const res = await this.fetchFn(`/api/flights/${encodeURIComponent(hex)}`);
      const body = res.ok ? ((await res.json()) as { flights: FlightSegment[] }) : { flights: [] };
      this.flights.set(body.flights);
    } catch {
      this.flights.set([]);
    }
    this.state.set('ready');
  }

  /** Registration → hex via the live search (registrations are unique per aircraft). */
  private async resolveRegistration(reg: string): Promise<string | null> {
    try {
      const res = await this.fetchFn(
        `/api/search?${new URLSearchParams({ q: reg, kind: 'flights' }).toString()}`,
      );
      if (!res.ok) return null;
      const { results } = (await res.json()) as { results: SearchResult[] };
      const norm = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const hit = results.find(
        (r) =>
          r.kind === 'aircraft' && r.registration !== null && norm(r.registration) === norm(reg),
      );
      return hit?.kind === 'aircraft' ? hit.hex : null;
    } catch {
      return null;
    }
  }
}
