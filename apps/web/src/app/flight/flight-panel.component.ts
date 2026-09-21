import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { FlightRoute, TrackPoint } from '../core/api/api-types';
import { FlightDataService, type Loadable } from '../core/flight/flight-data.service';
import { flightPhase, flightProgress } from '../core/flight/flight-progress';
import { FollowStore } from '../core/follow/follow.store';
import {
  formatAltitude,
  formatCoord,
  formatSpeed,
  formatTrack,
  formatVerticalRate,
} from '../core/format/format';
import { AircraftMetaService } from '../core/live/aircraft-meta.service';
import { StreamClient } from '../core/live/stream-client.service';
import { MapUiStore } from '../core/state/map-ui.store';
import { IconComponent } from '../ui/icon/icon.component';
import { AltitudeChartComponent } from './altitude-chart.component';

/** Readouts refresh at 4 Hz; nothing else in the DOM changes per frame. */
const TICK_MS = 250;
const TRACK_REFRESH_MS = 15_000;

const timeOf = (ms: number): string =>
  new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/** Flight detail (design 1b / 2a right panel). */
@Component({
  selector: 'st-flight-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AltitudeChartComponent, IconComponent],
  templateUrl: './flight-panel.component.html',
  styleUrl: './flight-panel.component.css',
})
export class FlightPanelComponent {
  private readonly store = inject(MapUiStore);
  private readonly client = inject(StreamClient);
  private readonly metaService = inject(AircraftMetaService);
  private readonly flightData = inject(FlightDataService);
  protected readonly follow = inject(FollowStore);
  private readonly tick = signal(0);
  protected readonly track = signal<readonly TrackPoint[]>([]);
  protected readonly copied = signal(false);

  constructor() {
    const timer = setInterval(() => {
      this.tick.update((t) => t + 1);
    }, TICK_MS);
    let trackTimer: ReturnType<typeof setInterval> | null = null;
    effect(() => {
      const hex = this.store.selected();
      this.track.set([]);
      if (trackTimer !== null) clearInterval(trackTimer);
      if (hex === null) return;
      const load = (): void => {
        void this.flightData.track(hex).then((r) => {
          if (r !== null && this.store.selected() === hex) this.track.set(r.points);
        });
      };
      load();
      trackTimer = setInterval(load, TRACK_REFRESH_MS);
    });
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      if (trackTimer !== null) clearInterval(trackTimer);
    });
  }

  private readonly meta = computed(() => {
    const hex = this.store.selected();
    return hex === null ? null : this.metaService.meta(hex)();
  });

  protected readonly route = computed<Loadable<FlightRoute> | null>(() => {
    const cs = this.meta()?.callsign ?? null;
    return cs === null ? null : this.flightData.route(cs)();
  });

  protected readonly flight = computed(() => {
    this.tick();
    const hex = this.store.selected();
    if (hex === null) return null;
    const ac = this.client.registry.aircraft.get(hex);
    if (ac === undefined) return null;
    const r = ac.record;
    const meta = this.meta();
    const route = this.route();
    const progress =
      route?.state === 'ready'
        ? flightProgress(route.value, r.lat, r.lon, r.onGround ? null : r.gs)
        : null;
    const ageSec = Math.round((Date.now() - ac.fixTime) / 1000);
    return {
      hex,
      title: meta?.callsign ?? hex.toUpperCase(),
      sub:
        [meta?.airline, meta?.typeName ?? meta?.typeCode, meta?.registration]
          .filter(Boolean)
          .join(' · ') || hex.toUpperCase(),
      emergency: r.emergency !== 'none',
      status:
        r.emergency !== 'none'
          ? `Emergency · ${r.emergency}`
          : flightPhase(r.onGround, r.baroRate, r.alt),
      progress,
      tiles: [
        { label: 'Altitude', value: formatAltitude(r.alt, r.onGround) },
        { label: 'Ground speed', value: formatSpeed(r.gs) },
        { label: 'Track', value: formatTrack(r.track) },
        { label: 'Vertical', value: formatVerticalRate(r.baroRate) },
      ],
      raw: [
        ['ICAO24', hex.toUpperCase()],
        ['Registration', meta?.registration ?? '—'],
        ['Country', meta?.country ?? '—'],
        ['Squawk', r.squawk ?? '—'],
        ['Category', r.category ?? '—'],
        ['Source', r.mlat ? 'MLAT' : r.tisb ? 'TIS-B' : 'ADS-B'],
        ['Position', formatCoord(r.lat, r.lon)],
        ['Last fix', `${ageSec} s ago`],
      ] as const,
      photoUrl: `https://www.planespotters.net/hex/${hex.replace('~', '').toUpperCase()}`,
    };
  });

  protected readonly recent = computed(() =>
    [...this.track()]
      .slice(-3)
      .reverse()
      .map((p) => ({
        t: timeOf(p.t),
        pos: formatCoord(p.lat, p.lon),
        alt: formatAltitude(p.alt, p.alt === 0),
      })),
  );

  protected readonly following = computed(() => {
    const hex = this.store.selected();
    return hex !== null && this.follow.flights().some((f) => f.hex === hex);
  });

  protected toggleFollow(): void {
    const hex = this.store.selected();
    if (hex === null) return;
    const now = this.follow.toggle(hex, this.meta()?.callsign ?? null);
    if (now) this.client.watch(hex);
    else this.client.unwatch(hex);
  }

  protected async share(): Promise<void> {
    const url = globalThis.location.href;
    const title = this.flight()?.title ?? 'SkyTrace';
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
      setTimeout(() => {
        this.copied.set(false);
      }, 1500);
    } catch {
      // User cancelled the share sheet.
    }
  }

  protected close(): void {
    this.store.select(null);
  }
}
