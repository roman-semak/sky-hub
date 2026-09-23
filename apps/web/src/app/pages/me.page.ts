import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  LOCALE_ID,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EmergencyNotifier } from '../alerts/emergency-notifier.service';
import { EmergencyStore } from '../alerts/emergency.store';
import { formatAltitude, formatSpeed } from '../core/format/format';
import { MapUiStore } from '../core/state/map-ui.store';
import { ThemeService, type ThemePreference } from '../core/theme/theme.service';
import { bearingLabel, OverheadService } from '../overhead/overhead.service';

/**
 * "Me" (design 1a tab): what is above the user right now, plus the
 * preferences that used to hide in the rail.
 */
@Component({
  selector: 'st-me-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './me.page.html',
  styleUrl: './me.page.css',
})
export class MePage {
  protected readonly overhead = inject(OverheadService);
  protected readonly theme = inject(ThemeService);
  protected readonly alerts = inject(EmergencyStore);
  protected readonly notifier = inject(EmergencyNotifier);
  private readonly map = inject(MapUiStore);
  private readonly router = inject(Router);
  protected readonly locale = inject(LOCALE_ID);
  protected readonly tick = signal(0);
  protected readonly themes: readonly { id: ThemePreference; label: string }[] = [
    { id: 'system', label: $localize`:@@me.themeSystem:System` },
    { id: 'dark', label: $localize`:@@me.themeDark:Dark` },
    { id: 'light', label: $localize`:@@me.themeLight:Light` },
  ];

  constructor() {
    this.overhead.start();
    const timer = setInterval(() => {
      this.tick.update((t) => t + 1);
    }, 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.overhead.stop();
    });
  }

  protected readonly rows = computed(() =>
    this.overhead.aircraft().map((a) => ({
      hex: a.hex,
      title: a.callsign ?? a.registration ?? a.hex.toUpperCase(),
      sub: [a.typeCode, formatAltitude(a.altitude, false), formatSpeed(a.gs)]
        .filter(Boolean)
        .join(' · '),
      bearing: bearingLabel(a.azimuth),
      elevation: `${Math.round(a.elevation)}°`,
      distance: `${a.slantRangeNm.toFixed(1)} nm`,
      lat: a.lat,
      lon: a.lon,
    })),
  );

  protected readonly headline = computed(() => {
    const top = this.overhead.top();
    if (top === null) return null;
    return {
      hex: top.hex,
      title: top.callsign ?? top.registration ?? top.hex.toUpperCase(),
      bearing: bearingLabel(top.azimuth),
      elevation: Math.round(top.elevation),
      altitude: formatAltitude(top.altitude, false),
      distance: `${top.slantRangeNm.toFixed(1)} nm`,
      lat: top.lat,
      lon: top.lon,
    };
  });

  /** Seconds since the last server answer, for the "updated N s ago" line. */
  protected readonly age = computed(() => {
    this.tick();
    const at = this.overhead.updatedAt();
    return at === null ? null : Math.max(0, Math.round((Date.now() - at) / 1000));
  });

  protected show(hex: string, lat: number, lon: number): void {
    this.map.flyTo(lat, lon, 10);
    this.map.select(hex);
    void this.router.navigate(['/']);
  }

  protected useMapCentre(): void {
    const c = this.map.center();
    this.overhead.useManual(c.lat, c.lon);
  }

  protected async toggleNotifications(): Promise<void> {
    if (this.alerts.notify()) this.notifier.disable();
    else await this.notifier.enable();
  }
}
