import { computed, Injectable, signal } from '@angular/core';
import type { BBox } from '@skytrace/geo';
import { DEFAULT_MAP_STATE, type UrlMapState } from '../url/url-state';

export type SheetStop = 'collapsed' | 'peek' | 'full';

/** View state shared by the map, its overlays and the URL (SPEC § 5.4). */
@Injectable({ providedIn: 'root' })
export class MapUiStore {
  readonly center = signal<{ lat: number; lon: number; zoom: number }>({
    lat: DEFAULT_MAP_STATE.lat,
    lon: DEFAULT_MAP_STATE.lon,
    zoom: DEFAULT_MAP_STATE.zoom,
  });
  readonly bbox = signal<BBox | null>(null);
  readonly selected = signal<string | null>(null);
  readonly hovered = signal<{ hex: string; x: number; y: number } | null>(null);
  readonly sheetStop = signal<SheetStop>('peek');
  readonly frameMs = signal(0);
  readonly fps = signal(0);
  readonly drawn = signal(0);

  readonly urlState = computed<UrlMapState>(() => {
    const c = this.center();
    return { lat: c.lat, lon: c.lon, zoom: c.zoom, selected: this.selected() };
  });

  select(hex: string | null): void {
    this.selected.set(hex);
    if (hex !== null && this.sheetStop() === 'collapsed') this.sheetStop.set('peek');
  }
}
