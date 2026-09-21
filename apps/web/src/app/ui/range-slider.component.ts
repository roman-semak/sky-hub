import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

/**
 * Dual-thumb range (design 1c "Altitude band"): two native range inputs on
 * one rail, so keyboard and screen readers work without extra code.
 */
@Component({
  selector: 'st-range-slider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="range" [style.--lo.%]="loPct()" [style.--hi.%]="hiPct()">
      <div class="rail"><div class="span"></div></div>
      <input
        type="range"
        [min]="min()"
        [max]="max()"
        [step]="step()"
        [value]="value()[0]"
        [attr.aria-label]="label() + ' minimum'"
        (input)="setLo($event)"
      />
      <input
        type="range"
        [min]="min()"
        [max]="max()"
        [step]="step()"
        [value]="value()[1]"
        [attr.aria-label]="label() + ' maximum'"
        (input)="setHi($event)"
      />
    </div>
    <div class="labels tabular">
      <span>{{ format()(value()[0]) }}</span>
      <span>{{ format()(value()[1]) }}</span>
    </div>
  `,
  styleUrl: './range-slider.component.css',
})
export class RangeSliderComponent {
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly step = input(1);
  readonly label = input('Range');
  readonly format = input<(v: number) => string>((v) => String(v));
  readonly value = model.required<readonly [number, number]>();

  protected readonly loPct = computed(() => this.pct(this.value()[0]));
  protected readonly hiPct = computed(() => this.pct(this.value()[1]));

  protected setLo(e: Event): void {
    const v = (e.target as HTMLInputElement).valueAsNumber;
    const [, hi] = this.value();
    this.value.set([Math.min(v, hi), hi]);
  }

  protected setHi(e: Event): void {
    const v = (e.target as HTMLInputElement).valueAsNumber;
    const [lo] = this.value();
    this.value.set([lo, Math.max(v, lo)]);
  }

  private pct(v: number): number {
    const span = this.max() - this.min();
    return span === 0 ? 0 : ((v - this.min()) / span) * 100;
  }
}
