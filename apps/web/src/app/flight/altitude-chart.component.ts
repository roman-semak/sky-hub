import type { ElementRef } from '@angular/core';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import type uPlot from 'uplot';
import type { TrackPoint } from '../core/api/api-types';

const HEIGHT = 96;

function cssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v === '' ? fallback : v;
}

/**
 * Altitude (filled) and ground speed over the recent track, drawn with uPlot
 * (SPEC § 5.3). uPlot is imported lazily with the detail panel.
 */
@Component({
  selector: 'st-altitude-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #host class="chart" role="img" [attr.aria-label]="label()"></div>
    @if (points().length < 2) {
      <p class="hint">Collecting the track — the profile fills in as positions arrive.</p>
    }
  `,
  styles: `
    .chart {
      width: 100%;
      min-height: ${HEIGHT}px;
    }
    :host {
      position: relative;
      display: block;
    }
    .chart ::ng-deep .u-legend {
      display: none;
    }
    .hint {
      position: absolute;
      inset: 0;
      margin: 0;
      display: grid;
      place-items: center;
      font-size: 12px;
      color: var(--color-neutral-400);
      text-align: center;
    }
  `,
})
export class AltitudeChartComponent {
  readonly points = input.required<readonly TrackPoint[]>();
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private plot: uPlot | null = null;
  private ctor: typeof uPlot | null = null;

  protected readonly label = (): string => {
    const pts = this.points();
    const alts = pts.map((p) => p.alt ?? 0);
    return pts.length === 0
      ? 'Altitude profile: no data yet'
      : `Altitude profile, ${pts.length} points, max ${Math.max(...alts)} ft`;
  };

  constructor() {
    afterNextRender(() => {
      void import('uplot').then((m) => {
        this.ctor = m.default;
        this.render();
      });
    });
    effect(() => {
      this.points();
      this.render();
    });
    const ro = new ResizeObserver(() => {
      const el = this.host().nativeElement;
      this.plot?.setSize({ width: el.clientWidth, height: HEIGHT });
    });
    afterNextRender(() => {
      ro.observe(this.host().nativeElement);
    });
    inject(DestroyRef).onDestroy(() => {
      ro.disconnect();
      this.plot?.destroy();
    });
  }

  private render(): void {
    const Ctor = this.ctor;
    if (Ctor === null) return;
    const pts = this.points();
    const data: uPlot.AlignedData = [
      pts.map((p) => p.t / 1000),
      pts.map((p) => p.alt),
      pts.map((p) => p.gs),
    ];
    if (this.plot !== null) {
      this.plot.setData(data);
      return;
    }
    const el = this.host().nativeElement;
    const accent = cssVar(el, '--color-accent-400', '#b5abfc');
    const muted = cssVar(el, '--color-neutral-500', '#9397ab');
    this.plot = new Ctor(
      {
        width: el.clientWidth || 300,
        height: HEIGHT,
        cursor: { show: false },
        legend: { show: false },
        padding: [6, 0, 0, 0],
        scales: {
          x: { time: true },
          alt: { range: (_u, _min, max) => [0, Math.max(1000, max * 1.1)] },
          gs: {},
        },
        axes: [{ show: false }, { show: false, scale: 'alt' }, { show: false, scale: 'gs' }],
        series: [
          {},
          {
            scale: 'alt',
            stroke: accent,
            width: 1.6,
            fill: (u: uPlot) => {
              const g = u.ctx.createLinearGradient(0, 0, 0, u.bbox.height);
              g.addColorStop(0, `${accent}73`);
              g.addColorStop(1, `${accent}00`);
              return g;
            },
            points: { show: false },
          },
          { scale: 'gs', stroke: muted, width: 1, dash: [4, 4], points: { show: false } },
        ],
      },
      data,
      el,
    );
  }
}
