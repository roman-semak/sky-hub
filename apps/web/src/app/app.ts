import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { StreamClient } from './core/live/stream-client.service';
import { ThemeService } from './core/theme/theme.service';
import { UrlStateService } from './core/url/url-state.service';
import { MapUiStore } from './core/state/map-ui.store';
import { NavRailComponent } from './ui/nav-rail.component';
import { TabBarComponent } from './ui/tab-bar.component';

/** App shell: left rail on desktop, tab bar on mobile (design 2a / 1a). */
@Component({
  selector: 'st-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NavRailComponent, RouterOutlet, TabBarComponent],
  template: `
    <div class="shell">
      <st-nav-rail class="rail" />
      <main class="content">
        <router-outlet />
      </main>
      <st-tab-bar class="tabs glass-strong" />
    </div>
  `,
  styleUrl: './app.css',
})
export class App {
  private readonly client = inject(StreamClient);

  constructor() {
    // Created eagerly: theme paints before first render, URL restores state
    // before the map is built.
    inject(ThemeService);
    inject(UrlStateService);
    const store = inject(MapUiStore);
    const synthetic = new URLSearchParams(globalThis.location.search).get('synthetic');
    const count = synthetic === null ? 0 : Number.parseInt(synthetic, 10);
    if (Number.isFinite(count) && count > 0) {
      const c = store.center();
      this.client.startSynthetic(Math.min(50_000, count), c.lat, c.lon);
    } else {
      this.client.start();
    }
    inject(DestroyRef).onDestroy(() => {
      this.client.stop();
    });
  }
}
