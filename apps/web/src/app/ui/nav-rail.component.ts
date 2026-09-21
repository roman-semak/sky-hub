import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { StreamClient } from '../core/live/stream-client.service';
import { ThemeService } from '../core/theme/theme.service';
import { formatBytesPerSec, formatCount } from '../core/format/format';
import { IconComponent } from './icon/icon.component';

/** Desktop left rail (design 2a): brand, navigation, live feed stats. */
@Component({
  selector: 'st-nav-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, RouterLink, RouterLinkActive],
  template: `
    <nav class="rail" aria-label="Main">
      <div class="brand">
        <st-icon name="radioactive" class="brand-icon" />
        <span class="brand-name">Radar</span>
        <span class="live"><span class="live-dot"></span>{{ connectionLabel() }}</span>
      </div>
      <ul class="nav">
        @for (item of items; track item.path) {
          <li>
            <a
              [routerLink]="item.path"
              routerLinkActive="is-active"
              [routerLinkActiveOptions]="{ exact: item.path === '/' }"
            >
              <st-icon [name]="item.icon" class="nav-icon" />
              <span class="label">{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>
      <div class="feed">
        <span class="eyebrow">Feed</span>
        <div class="row">
          <span>Aircraft</span><span class="tabular">{{ aircraft() }}</span>
        </div>
        <div class="row">
          <span>Stream</span><span class="tabular">{{ stream() }}</span>
        </div>
        <div class="row">
          <span>WS latency</span><span class="tabular">{{ latency() }}</span>
        </div>
      </div>
      <button type="button" class="theme" (click)="theme.toggle()">
        <st-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" class="nav-icon" />
        <span class="label">{{ theme.theme() === 'dark' ? 'Light theme' : 'Dark theme' }}</span>
      </button>
    </nav>
  `,
  styleUrl: './nav-rail.component.css',
})
export class NavRailComponent {
  protected readonly theme = inject(ThemeService);
  private readonly client = inject(StreamClient);
  protected readonly items = [
    { path: '/', icon: 'globe', label: 'Map' },
    { path: '/search', icon: 'magnifying-glass', label: 'Search' },
    { path: '/following', icon: 'bookmark-simple', label: 'Following' },
    { path: '/stats', icon: 'sliders-horizontal', label: 'Stats' },
  ] as const;

  protected readonly aircraft = () => formatCount(this.client.aircraftCount());
  protected readonly connectionLabel = () => {
    const c = this.client.connection();
    return c === 'live' ? 'live' : c === 'offline' ? 'offline' : 'reconnecting';
  };
  protected readonly latency = () => {
    const rtt = this.client.rttMs();
    return rtt === null ? '—' : `${rtt} ms`;
  };
  protected readonly stream = () => formatBytesPerSec(this.client.bytesPerSec());
}
