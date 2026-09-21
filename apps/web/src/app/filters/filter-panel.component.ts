import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FilterStore } from '../core/filters/filter.store';
import { IconComponent } from '../ui/icon/icon.component';
import { RangeSliderComponent } from '../ui/range-slider.component';
import {
  ALT_RANGE,
  draftFromSpec,
  flightLevel,
  normalizeCode,
  SPEED_RANGE,
  specFromDraft,
  type FilterDraft,
} from './filter-draft';

type ListKey = 'operators' | 'types' | 'countries';
type FlagKey = 'militaryOnly' | 'emergencyOnly' | 'laddOnly';

const QUICK_OPERATORS = ['TAP', 'KLM', 'BAW', 'DLH', 'AFR', 'RYR', 'EZY', 'UAE', 'THY', 'WZZ'];

/** Filters sheet (design 1c): altitude band, operators, flags, presets, live count. */
@Component({
  selector: 'st-filter-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, RangeSliderComponent],
  templateUrl: './filter-panel.component.html',
  styleUrl: './filter-panel.component.css',
})
export class FilterPanelComponent {
  protected readonly filters = inject(FilterStore);
  protected readonly draft = signal<FilterDraft>(draftFromSpec(this.filters.applied()));
  protected readonly count = signal<number | null>(null);
  protected readonly presetName = signal('');
  protected readonly quickOperators = QUICK_OPERATORS;
  protected readonly altRange = ALT_RANGE;
  protected readonly speedRange = SPEED_RANGE;
  protected readonly flightLevel = flightLevel;
  protected readonly knots = (v: number): string => (v >= SPEED_RANGE[1] ? `${v}+ kt` : `${v} kt`);
  protected readonly flags: readonly { key: FlagKey; label: string }[] = [
    { key: 'militaryOnly', label: 'Military only' },
    { key: 'emergencyOnly', label: 'Emergencies only' },
    { key: 'laddOnly', label: 'LADD-blocked only' },
  ];
  protected readonly lists: readonly {
    key: ListKey;
    label: string;
    placeholder: string;
    max: number;
  }[] = [
    { key: 'types', label: 'Aircraft types', placeholder: 'ICAO type, e.g. A20N', max: 4 },
    {
      key: 'countries',
      label: 'Country of registration',
      placeholder: 'ISO code, e.g. PT',
      max: 2,
    },
  ];

  constructor() {
    let timer: ReturnType<typeof setTimeout> | null = null;
    effect(() => {
      const spec = specFromDraft(this.draft());
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        void this.filters.preview(spec).then((n) => {
          this.count.set(n);
        });
      }, 250);
    });
    inject(DestroyRef).onDestroy(() => {
      if (timer !== null) clearTimeout(timer);
    });
  }

  protected patch(p: Partial<FilterDraft>): void {
    this.draft.update((d) => ({ ...d, ...p }));
  }

  protected toggleFlag(key: FlagKey): void {
    this.draft.update((d) => ({ ...d, [key]: !d[key] }));
  }

  protected toggleOperator(code: string): void {
    this.draft.update((d) => ({
      ...d,
      operators: d.operators.includes(code)
        ? d.operators.filter((o) => o !== code)
        : [...d.operators, code],
    }));
  }

  protected addCode(key: ListKey, input: HTMLInputElement, maxLen: number): void {
    const code = normalizeCode(input.value, maxLen);
    if (code === null) return;
    this.draft.update((d) => (d[key].includes(code) ? d : { ...d, [key]: [...d[key], code] }));
    input.value = '';
  }

  protected removeCode(key: ListKey, code: string): void {
    this.draft.update((d) => ({ ...d, [key]: d[key].filter((c) => c !== code) }));
  }

  protected reset(): void {
    this.draft.set(draftFromSpec({}));
  }

  protected apply(): void {
    this.filters.apply(specFromDraft(this.draft()));
    this.filters.open.set(false);
  }

  protected close(): void {
    this.filters.open.set(false);
  }

  protected savePreset(): void {
    this.filters.savePreset(this.presetName(), specFromDraft(this.draft()));
    this.presetName.set('');
  }

  protected loadPreset(name: string): void {
    const p = this.filters.presets().find((x) => x.name === name);
    if (p !== undefined) this.draft.set(draftFromSpec(p.filter));
  }

  protected setName(e: Event): void {
    this.presetName.set((e.target as HTMLInputElement).value);
  }
}
