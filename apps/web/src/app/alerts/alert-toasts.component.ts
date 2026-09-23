import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { MapUiStore } from '../core/state/map-ui.store';
import { IconComponent } from '../ui/icon/icon.component';
import { EmergencyStore, SQUAWK_MEANING } from './emergency.store';

/** How long a new emergency stays on screen as a toast. */
const VISIBLE_MS = 45_000;

/** How often the expiry clock is re-read. */
const TICK_MS = 5_000;

/** Toasts for new emergency squawks (SPEC phase 8). */
@Component({
  selector: 'st-alert-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (visible().length > 0) {
      <div class="stack" role="alert" aria-live="assertive">
        @for (a of visible(); track a.hex) {
          <div class="toast">
            <st-icon name="bell-ringing" class="bell" />
            <button type="button" class="body" (click)="open(a.hex, a.lat, a.lon)">
              <span class="title">{{ a.title }}</span>
              <span class="meta">{{ a.meta }}</span>
            </button>
            <button
              type="button"
              class="close"
              i18n-aria-label="@@common.dismiss"
              aria-label="Dismiss"
              (click)="store.acknowledge(a.hex)"
            >
              <st-icon name="x-circle" />
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .stack {
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 30;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(420px, calc(100vw - 28px));
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 16px;
      background: rgba(255, 84, 84, 0.16);
      border: 1px solid rgba(255, 84, 84, 0.5);
      -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(150%);
      backdrop-filter: blur(var(--glass-blur)) saturate(150%);
      box-shadow: 0 10px 28px var(--drop);
    }
    .bell {
      font-size: 18px;
      color: #ff9d9d;
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      text-align: left;
      min-width: 0;
    }
    .title {
      font-size: 14px;
      font-weight: 600;
    }
    .meta {
      font-size: 12px;
      color: var(--color-neutral-300);
    }
    .close {
      font-size: 17px;
      color: var(--color-neutral-300);
      display: grid;
      min-width: 32px;
      min-height: 32px;
      place-items: center;
    }
  `,
})
export class AlertToastsComponent {
  protected readonly store = inject(EmergencyStore);
  private readonly map = inject(MapUiStore);
  private readonly router = inject(Router);
  /** Zoneless: without this, the expiry below is only re-evaluated when a
   * new alert arrives, and a lone toast would stay on screen for good. */
  private readonly tick = signal(0);

  constructor() {
    const timer = setInterval(() => {
      if (this.store.alerts().some((a) => !a.acknowledged)) this.tick.update((n) => n + 1);
    }, TICK_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
    });
  }

  protected readonly visible = computed(() => {
    // Read the tick so the expiry below re-runs on the clock, not only when
    // the alert list changes.
    this.tick();
    const now = Date.now();
    return this.store
      .alerts()
      .filter((a) => !a.acknowledged && now - a.receivedAt < VISIBLE_MS)
      .slice(0, 3)
      .map((a) => ({
        hex: a.hex,
        lat: a.lat,
        lon: a.lon,
        title: $localize`:@@alert.toastTitle:Squawk ${a.squawk ?? '—'}:squawk: · ${a.callsign ?? a.hex.toUpperCase()}:flight:`,
        meta: a.squawk === null ? a.kind : (SQUAWK_MEANING[a.squawk] ?? a.kind),
      }));
  });

  protected open(hex: string, lat: number, lon: number): void {
    this.store.acknowledge(hex);
    this.map.flyTo(lat, lon, 8);
    this.map.select(hex);
    void this.router.navigate(['/']);
  }
}
