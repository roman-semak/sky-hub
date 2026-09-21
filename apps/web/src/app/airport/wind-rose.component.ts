import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SPEED_BANDS, wedgePath, windRose, type WindObservation } from './wind-rose';

const SIZE = 180;
const C = SIZE / 2;
const INNER = 10;
const OUTER = C - 16;
const BAND_LABELS = ['≤5 kt', '6–10', '11–20', '>20'];

/** Wind rose of the last 24 h of METARs (SPEC § 5.3 screen 4). */
@Component({
  selector: 'st-wind-rose',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + size + ' ' + size" role="img" [attr.aria-label]="label()">
      @for (r of rings; track r) {
        <circle [attr.cx]="c" [attr.cy]="c" [attr.r]="r" class="ring" />
      }
      @for (w of wedges(); track w.key) {
        <path [attr.d]="w.d" [class]="'band band-' + w.band" />
      }
      @for (l of compass; track l.t) {
        <text [attr.x]="l.x" [attr.y]="l.y" class="compass">{{ l.t }}</text>
      }
    </svg>
    <ul class="legend">
      @for (b of bands; track b.label) {
        <li><span [class]="'swatch band-' + b.i"></span>{{ b.label }}</li>
      }
      <li class="calm" i18n="@@rose.calm">calm {{ calmPct() }}%</li>
    </ul>
  `,
  styles: `
    :host {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }
    svg {
      width: 180px;
      height: 180px;
    }
    .ring {
      fill: none;
      stroke: rgba(var(--ink), 0.12);
    }
    .compass {
      font-size: 10px;
      fill: var(--color-neutral-400);
      text-anchor: middle;
      dominant-baseline: middle;
    }
    .band-0 {
      fill: var(--color-accent-800);
      background: var(--color-accent-800);
    }
    .band-1 {
      fill: var(--color-accent-600);
      background: var(--color-accent-600);
    }
    .band-2 {
      fill: var(--color-accent-400);
      background: var(--color-accent-400);
    }
    .band-3 {
      fill: var(--color-accent-200);
      background: var(--color-accent-200);
    }
    .legend {
      list-style: none;
      margin: 0;
      padding: 0;
      font-size: 12px;
      color: var(--color-neutral-400);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .swatch {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 3px;
      margin-right: 6px;
    }
  `,
})
export class WindRoseComponent {
  readonly observations = input.required<readonly WindObservation[]>();
  protected readonly size = SIZE;
  protected readonly c = C;
  protected readonly rings = [OUTER / 3 + INNER, (2 * OUTER) / 3, OUTER];
  protected readonly bands = BAND_LABELS.map((label, i) => ({ label, i }));
  protected readonly compass = [
    { t: 'N', x: C, y: 7 },
    { t: 'E', x: SIZE - 7, y: C },
    { t: 'S', x: C, y: SIZE - 7 },
    { t: 'W', x: 7, y: C },
  ];

  private readonly rose = computed(() => windRose(this.observations()));
  protected readonly calmPct = computed(() => Math.round(this.rose().calm * 100));
  protected readonly label = computed(() => {
    const top = [...this.rose().sectors].sort((a, b) => b.total - a.total)[0];
    return top === undefined || top.total === 0
      ? $localize`:@@rose.empty:Wind rose: no wind observations`
      : $localize`:@@rose.label:Wind rose over ${this.observations().length}:count: observations, most often from ${Math.round(top.dir)}:dir:°`;
  });

  protected readonly wedges = computed(() => {
    const { sectors } = this.rose();
    const max = Math.max(0.0001, ...sectors.map((s) => s.total));
    const half = 360 / sectors.length / 2 - 1.5;
    const out: { key: string; d: string; band: number }[] = [];
    for (const s of sectors) {
      let r = INNER;
      s.bands.forEach((share, band) => {
        if (share === 0 || band >= SPEED_BANDS.length) return;
        const next = r + (share / max) * (OUTER - INNER);
        out.push({
          key: `${s.dir}-${band}`,
          d: wedgePath(C, C, r, next, s.dir - half, s.dir + half),
          band,
        });
        r = next;
      });
    }
    return out;
  });
}
