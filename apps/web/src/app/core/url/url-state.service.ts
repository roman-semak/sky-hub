import { DestroyRef, effect, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { MapUiStore } from '../state/map-ui.store';
import { parseMapState, serializeMapState } from './url-state';

/** Keeps `/?lat&lon&z&sel` and the map view in sync (SPEC § 5.4). */
@Injectable({ providedIn: 'root' })
export class UrlStateService {
  private readonly router = inject(Router);
  private readonly store = inject(MapUiStore);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.restore(globalThis.location.search);
    effect(() => {
      const params = serializeMapState(this.store.urlState());
      if (this.timer !== null) clearTimeout(this.timer);
      // Panning fires continuously; coalesce so history is not flooded.
      this.timer = setTimeout(() => {
        void this.router.navigate([], { queryParams: params, replaceUrl: true });
      }, 250);
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.timer !== null) clearTimeout(this.timer);
    });
  }

  /** Applies the URL to the store; runs before the map is created. */
  restore(search: string): void {
    const state = parseMapState(new URLSearchParams(search));
    this.store.center.set({ lat: state.lat, lon: state.lon, zoom: state.zoom });
    this.store.selected.set(state.selected);
  }
}
