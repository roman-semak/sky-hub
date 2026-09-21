import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FlightDataService } from '../core/flight/flight-data.service';
import { flightPhase, flightProgress } from '../core/flight/flight-progress';
import { FollowStore } from '../core/follow/follow.store';
import { formatAltitude } from '../core/format/format';
import { AircraftMetaService } from '../core/live/aircraft-meta.service';
import { StreamClient } from '../core/live/stream-client.service';
import { MapUiStore } from '../core/state/map-ui.store';

/** Followed flights with live status (design 1d). */
@Component({
  selector: 'st-following-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './following.page.html',
  styleUrl: './following.page.css',
})
export class FollowingPage {
  protected readonly follow = inject(FollowStore);
  private readonly client = inject(StreamClient);
  private readonly meta = inject(AircraftMetaService);
  private readonly flightData = inject(FlightDataService);
  private readonly store = inject(MapUiStore);
  private readonly router = inject(Router);
  private readonly tick = signal(0);

  constructor() {
    // Followed aircraft are streamed wherever they are.
    for (const f of this.follow.flights()) this.client.watch(f.hex);
    const timer = setInterval(() => {
      this.tick.update((t) => t + 1);
    }, 2000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
    });
  }

  protected readonly cards = computed(() => {
    this.tick();
    return this.follow.flights().map((f) => {
      const live = this.client.registry.aircraft.get(f.hex);
      const meta = this.meta.meta(f.hex)();
      const callsign = meta?.callsign ?? f.callsign;
      const route = callsign === null ? null : this.flightData.route(callsign)();
      const r = live?.record;
      const progress =
        route?.state === 'ready' && r !== undefined
          ? flightProgress(route.value, r.lat, r.lon, r.onGround ? null : r.gs)
          : null;
      return {
        hex: f.hex,
        title: callsign ?? f.hex.toUpperCase(),
        live: r !== undefined,
        status: r === undefined ? 'Not in coverage' : flightPhase(r.onGround, r.baroRate, r.alt),
        from:
          route?.state === 'ready' ? (route.value.origin.iata ?? route.value.origin.icao) : null,
        to:
          route?.state === 'ready'
            ? (route.value.destination.iata ?? route.value.destination.icao)
            : null,
        fraction: progress?.fraction ?? 0,
        caption:
          r === undefined
            ? 'Last seen before this session'
            : progress !== null && progress.etaMin !== null
              ? `Lands in ${progress.etaMin} min · ${formatAltitude(r.alt, r.onGround)}`
              : formatAltitude(r.alt, r.onGround),
      };
    });
  });

  protected readonly summary = computed(() => {
    const n = this.cards().length;
    const live = this.cards().filter((c) => c.live).length;
    return `${n} ${n === 1 ? 'flight' : 'flights'} · ${live} live`;
  });

  protected open(hex: string): void {
    const ac = this.client.registry.aircraft.get(hex);
    if (ac !== undefined) this.store.flyTo(ac.record.lat, ac.record.lon, 8);
    this.store.select(hex);
    void this.router.navigate(['/']);
  }

  protected unfollow(hex: string): void {
    this.follow.toggle(hex, null);
    this.client.unwatch(hex);
  }

  protected toggleAlerts(e: Event): void {
    this.follow.setAlerts((e.target as HTMLInputElement).checked);
  }
}
