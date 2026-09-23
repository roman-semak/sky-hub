import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EmergencyNotifier } from '../alerts/emergency-notifier.service';
import { EmergencyStore, SQUAWK_MEANING } from '../alerts/emergency.store';
import { MapUiStore } from '../core/state/map-ui.store';

const time = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Emergency monitor (SPEC phase 8): every 7500/7600/7700 squawk in coverage. */
@Component({
  selector: 'st-alerts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './alerts.page.html',
  styleUrl: './alerts.page.css',
})
export class AlertsPage {
  protected readonly store = inject(EmergencyStore);
  protected readonly notifier = inject(EmergencyNotifier);
  private readonly map = inject(MapUiStore);
  private readonly router = inject(Router);

  constructor() {
    this.store.acknowledgeAll();
  }

  protected readonly rows = computed(() =>
    this.store.alerts().map((a) => ({
      hex: a.hex,
      title: a.callsign ?? a.hex.toUpperCase(),
      squawk: a.squawk ?? '—',
      meaning: a.squawk === null ? a.kind : (SQUAWK_MEANING[a.squawk] ?? a.kind),
      when: time(a.receivedAt),
      military: a.military,
      lat: a.lat,
      lon: a.lon,
    })),
  );

  protected open(hex: string, lat: number, lon: number): void {
    this.map.flyTo(lat, lon, 8);
    this.map.select(hex);
    void this.router.navigate(['/']);
  }

  protected async toggleNotifications(): Promise<void> {
    if (this.store.notify()) this.notifier.disable();
    else await this.notifier.enable();
  }
}
