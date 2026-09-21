import { computed, inject, Injectable, signal } from '@angular/core';
import type { FilterSpec } from '@skytrace/adsb-types';
import { StreamClient } from '../live/stream-client.service';
import { activeCriteria, loadPresets, savePresets, type FilterPreset } from './filter-presets';

/** Applied filter, the draft being edited, and saved presets. */
@Injectable({ providedIn: 'root' })
export class FilterStore {
  private readonly client = inject(StreamClient);
  readonly applied = signal<FilterSpec>({});
  readonly open = signal(false);
  readonly presets = signal<FilterPreset[]>(loadPresets());
  readonly activeCount = computed(() => activeCriteria(this.applied()));

  apply(f: FilterSpec): void {
    this.applied.set(f);
    this.client.setFilter(f);
  }

  reset(): void {
    this.apply({});
  }

  savePreset(name: string, filter: FilterSpec): void {
    const trimmed = name.trim();
    if (trimmed === '') return;
    const next = [...this.presets().filter((p) => p.name !== trimmed), { name: trimmed, filter }];
    this.presets.set(next);
    savePresets(next);
  }

  deletePreset(name: string): void {
    const next = this.presets().filter((p) => p.name !== name);
    this.presets.set(next);
    savePresets(next);
  }

  /** Live "Show N flights" count for a draft, answered by the server. */
  preview(f: FilterSpec): Promise<number> {
    return this.client.preview(f);
  }
}
