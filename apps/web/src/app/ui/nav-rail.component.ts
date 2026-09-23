import { ChangeDetectionStrategy, Component, inject, LOCALE_ID } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { StreamClient } from '../core/live/stream-client.service';
import { EmergencyStore } from '../alerts/emergency.store';
import { FilterStore } from '../core/filters/filter.store';
import { ThemeService } from '../core/theme/theme.service';
import { formatBytesPerSec, formatCount } from '../core/format/format';
import { IconComponent } from './icon/icon.component';

/** Desktop left rail (design 2a): brand, navigation, live feed stats. */
@Component({
  selector: 'st-nav-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, RouterLink, RouterLinkActive],
  template: `
    <nav class="rail" i18n-aria-label="@@nav.main" aria-label="Main">
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
              @if (item.path === '/alerts' && emergencies.unread() > 0) {
                <span class="badge alert">{{ emergencies.unread() }}</span>
              }
            </a>
          </li>
        }
        <li>
          <button type="button" class="nav-button" (click)="filters.open.set(true)">
            <st-icon name="sliders-horizontal" class="nav-icon" />
            <span class="label" i18n="@@nav.filters">Filters</span>
            @if (filters.activeCount() > 0) {
              <span class="badge">{{ filters.activeCount() }}</span>
            }
          </button>
        </li>
      </ul>
      <div class="feed">
        <span class="eyebrow" i18n="@@feed.title">Feed</span>
        <div class="row">
          <span i18n="@@feed.aircraft">Aircraft</span><span class="tabular">{{ aircraft() }}</span>
        </div>
        <div class="row">
          <span i18n="@@feed.stream">Stream</span><span class="tabular">{{ stream() }}</span>
        </div>
        <div class="row">
          <span i18n="@@feed.latency">WS latency</span><span class="tabular">{{ latency() }}</span>
        </div>
      </div>
      <a
        class="theme"
        [href]="otherLocale.href"
        [attr.hreflang]="otherLocale.code"
        [attr.lang]="otherLocale.code"
      >
        <st-icon name="globe-line" class="nav-icon" />
        <span class="label">{{ otherLocale.label }}</span>
      </a>
      <button type="button" class="theme" (click)="theme.toggle()">
        <st-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" class="nav-icon" />
        @if (theme.theme() === 'dark') {
          <span class="label" i18n="@@nav.lightTheme">Light theme</span>
        } @else {
          <span class="label" i18n="@@nav.darkTheme">Dark theme</span>
        }
      </button>
    </nav>
  `,
  styleUrl: './nav-rail.component.css',
})
export class NavRailComponent {
  protected readonly theme = inject(ThemeService);
  /**
   * The other UI language. Each locale is its own build (`/` and `/uk/`), so
   * switching is a full navigation that keeps the current path and view.
   */
  protected readonly otherLocale = ((): { code: string; label: string; href: string } => {
    const current = inject(LOCALE_ID);
    const { pathname, search } = globalThis.location;
    const path = pathname.replace(/^\/uk(?=\/|$)/, '') || '/';
    return current.startsWith('uk')
      ? { code: 'en', label: 'English', href: `${path}${search}` }
      : { code: 'uk', label: 'Українська', href: `/uk${path}${search}` };
  })();
  protected readonly filters = inject(FilterStore);
  protected readonly emergencies = inject(EmergencyStore);
  private readonly client = inject(StreamClient);
  protected readonly items = [
    { path: '/', icon: 'globe', label: $localize`:@@nav.map:Map` },
    { path: '/search', icon: 'magnifying-glass', label: $localize`:@@nav.search:Search` },
    { path: '/following', icon: 'bookmark-simple', label: $localize`:@@nav.following:Following` },
    { path: '/alerts', icon: 'bell', label: $localize`:@@nav.alerts:Alerts` },
    { path: '/stats', icon: 'globe-line', label: $localize`:@@nav.stats:Stats` },
  ] as const;

  protected readonly aircraft = () => formatCount(this.client.aircraftCount());
  protected readonly connectionLabel = () => {
    const c = this.client.connection();
    return c === 'live'
      ? $localize`:@@conn.live:live`
      : c === 'offline'
        ? $localize`:@@conn.offline:offline`
        : $localize`:@@conn.reconnecting:reconnecting`;
  };
  protected readonly latency = () => {
    const rtt = this.client.rttMs();
    return rtt === null ? '—' : `${rtt} ms`;
  };
  protected readonly stream = () => formatBytesPerSec(this.client.bytesPerSec());
}
