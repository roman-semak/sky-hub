import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { formatAge } from '../core/format/format';
import { StreamClient } from '../core/live/stream-client.service';

/** Stale-data banner for a dropped stream (SPEC § 5.4, offline mode). */
@Component({
  selector: 'st-connection-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message(); as text) {
      <div class="banner glass" role="status" aria-live="polite">
        <span class="live-dot"></span>
        {{ text }}
      </div>
    }
  `,
  styles: `
    .banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 12px;
      color: var(--color-neutral-300);
    }
  `,
})
export class ConnectionBannerComponent {
  private readonly client = inject(StreamClient);
  private readonly tick = signal(0);

  constructor() {
    const timer = setInterval(() => {
      this.tick.update((t) => t + 1);
    }, 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
    });
  }

  protected readonly message = computed(() => {
    this.tick();
    const state = this.client.connection();
    if (state === 'live') return null;
    const last = this.client.lastFrameAt();
    const age = last === null ? null : formatAge((Date.now() - last) / 1000);
    if (state === 'connecting') return 'Connecting…';
    const label = state === 'offline' ? 'Offline' : 'Reconnecting…';
    return age === null ? label : `${label} · data ${age} old`;
  });
}
