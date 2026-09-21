import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

/**
 * Data attribution and disclaimer (SPEC § 9: ODbL attribution in the footer,
 * "not a source of navigational information"). Rendered by the page rather
 * than MapLibre so it is visible before the map has loaded. On narrow
 * screens it collapses behind an info button, like MapLibre's own control.
 */
@Component({
  selector: 'st-attribution',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" [class.open]="open()">
      <button
        type="button"
        class="toggle"
        [attr.aria-expanded]="open()"
        aria-controls="attribution-text"
        i18n-aria-label="@@attr.toggle"
        aria-label="Data sources and disclaimer"
        (click)="open.set(!open())"
      >
        i
      </button>
      <p class="attribution" id="attribution-text">
        <span i18n="@@attr.aircraft">Aircraft data</span>:
        <a href="https://adsb.lol" target="_blank" rel="noopener">adsb.lol</a>,
        <a href="https://adsb.fi" target="_blank" rel="noopener">adsb.fi</a> (ODbL) · ©
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener"
          >OpenStreetMap</a
        >
        · © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a> ·
        <span i18n="@@attr.disclaimer">Non-commercial, not for navigation</span>
      </p>
    </div>
  `,
  styles: `
    .wrap {
      display: flex;
      align-items: center;
      gap: 6px;
      justify-content: flex-end;
    }
    .attribution {
      margin: 0;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      line-height: 1.4;
      color: var(--color-neutral-300);
      background: rgba(var(--ink), 0.08);
      -webkit-backdrop-filter: blur(var(--glass-blur));
      backdrop-filter: blur(var(--glass-blur));
    }
    a {
      color: var(--color-neutral-200);
    }
    .toggle {
      display: none;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      font:
        italic 600 13px/1 Georgia,
        serif;
      color: var(--color-neutral-200);
      background: rgba(var(--ink), 0.12);
      -webkit-backdrop-filter: blur(var(--glass-blur));
      backdrop-filter: blur(var(--glass-blur));
    }
    @media (max-width: 767px) {
      .toggle {
        display: grid;
        place-items: center;
      }
      .wrap:not(.open) .attribution {
        display: none;
      }
    }
  `,
})
export class AttributionComponent {
  protected readonly open = signal(false);
}
