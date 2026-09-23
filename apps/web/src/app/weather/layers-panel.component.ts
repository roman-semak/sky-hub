import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { WeatherLayersService, WIND_LEVELS, type WindLevel } from './weather-layers.service';

/** Map layers popover: precipitation radar and wind aloft (SPEC phase 6). */
@Component({
  selector: 'st-layers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="panel glass"
      role="dialog"
      aria-label="Map layers"
      i18n-aria-label="@@layers.mapLayers"
      data-testid="layers-panel"
    >
      <label class="row">
        <input
          type="checkbox"
          [checked]="weather.radarOn()"
          (change)="weather.radarOn.set(checked($event))"
        />
        <span class="text">
          <span class="title" i18n="@@layers.precipitationRadar">Precipitation radar</span>
          <span class="sub">{{ radarCaption() }}</span>
        </span>
      </label>
      <label class="row">
        <input
          type="checkbox"
          [checked]="weather.windOn()"
          (change)="weather.windOn.set(checked($event))"
        />
        <span class="text">
          <span class="title" i18n="@@layers.windAloft">Wind aloft</span>
          <span class="sub" i18n="@@layers.openMeteoForecastCurrentHour"
            >Open-Meteo forecast, current hour</span
          >
        </span>
      </label>
      <label class="row">
        <input
          type="checkbox"
          [checked]="weather.heatmapOn()"
          (change)="weather.heatmapOn.set(checked($event))"
        />
        <span class="text">
          <span class="title" i18n="@@layers.heatmap">Traffic density</span>
          <span class="sub" i18n="@@layers.heatmapSub">Positions recorded in the last 24 h</span>
        </span>
      </label>
      <label class="row">
        <input
          type="checkbox"
          [checked]="weather.threeD()"
          (change)="weather.threeD.set(checked($event))"
        />
        <span class="text">
          <span class="title" i18n="@@layers.threeD">3D terrain</span>
          <span class="sub" i18n="@@layers.threeDSub"
            >Tilted camera, aircraft at their real altitude</span
          >
        </span>
      </label>
      <label class="row">
        <input
          type="checkbox"
          [checked]="weather.militaryHighlight()"
          (change)="weather.militaryHighlight.set(checked($event))"
        />
        <span class="text">
          <span class="title" i18n="@@layers.military">Highlight military</span>
          <span class="sub" i18n="@@layers.militarySub">Aircraft flagged military by the feed</span>
        </span>
      </label>
      @if (weather.windOn()) {
        <div
          class="levels"
          role="radiogroup"
          aria-label="Wind level"
          i18n-aria-label="@@layers.windLevel"
        >
          @for (l of levels; track l.level) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="weather.windLevel() === l.level"
              (click)="setLevel(l.level)"
            >
              {{ l.label }}
            </button>
          }
        </div>
      }
      <button type="button" class="done" (click)="closed.emit()" i18n="@@layers.done">Done</button>
    </div>
  `,
  styles: `
    .panel {
      width: 260px;
      padding: 14px;
      border-radius: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .row {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      cursor: pointer;
    }
    input {
      margin-top: 3px;
      accent-color: var(--color-accent-500);
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .title {
      font-size: 14px;
    }
    .sub {
      font-size: 12px;
      color: var(--color-neutral-400);
    }
    .levels {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      padding: 3px;
      border-radius: 12px;
      background: rgba(var(--ink), 0.07);
    }
    .levels button {
      padding: 6px 0;
      border-radius: 9px;
      font-size: 12px;
      color: var(--color-neutral-400);
    }
    .levels button[aria-checked='true'] {
      background: rgba(var(--acc), 0.28);
      color: var(--color-accent-100);
    }
    .done {
      align-self: flex-end;
      font-size: 13px;
      color: var(--color-accent-300);
      padding: 4px 6px;
    }
  `,
})
export class LayersPanelComponent {
  protected readonly weather = inject(WeatherLayersService);
  protected readonly levels = WIND_LEVELS;
  readonly closed = output();

  protected readonly radarCaption = computed(() => {
    const t = this.weather.radarTime();
    if (!this.weather.radarOn())
      return $localize`:@@layers.radarIdle:RainViewer, updated every 10 min`;
    if (t === null) return $localize`:@@layers.loading:Loading…`;
    const time = new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return $localize`:@@layers.radarTime:RainViewer, ${time}:time:`;
  });

  protected checked(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }

  protected setLevel(level: WindLevel): void {
    this.weather.windLevel.set(level);
  }
}
