import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from './icon/icon.component';

/** Mobile tab bar (design 1a): four columns, 22 px icons over 10 px labels. */
@Component({
  selector: 'st-tab-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, RouterLink, RouterLinkActive],
  template: `
    <nav class="tabs" i18n-aria-label="@@nav.main" aria-label="Main">
      @for (item of items; track item.path) {
        <a
          [routerLink]="item.path"
          routerLinkActive="is-active"
          [routerLinkActiveOptions]="{ exact: item.path === '/' }"
        >
          <st-icon [name]="item.icon" class="tab-icon" />
          <span>{{ item.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: `
    .tabs {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      padding: 10px 6px calc(10px + env(safe-area-inset-bottom, 16px));
      border-top: 1px solid rgba(var(--ink), 0.08);
    }
    a {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      color: var(--color-neutral-400);
      min-height: 44px;
      justify-content: center;
    }
    a.is-active {
      color: var(--color-accent-300);
    }
    .tab-icon {
      font-size: 22px;
    }
  `,
})
export class TabBarComponent {
  protected readonly items = [
    { path: '/', icon: 'globe', label: $localize`:@@nav.map:Map` },
    { path: '/search', icon: 'magnifying-glass', label: $localize`:@@nav.search:Search` },
    { path: '/following', icon: 'bookmark-simple', label: $localize`:@@nav.following:Following` },
    { path: '/me', icon: 'user', label: $localize`:@@nav.me:Me` },
  ] as const;
}
