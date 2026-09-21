import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { BBox } from '@skytrace/geo';
import { FlightPanelComponent } from '../flight/flight-panel.component';
import { StreamClient } from '../core/live/stream-client.service';
import { MapUiStore } from '../core/state/map-ui.store';
import { MapViewComponent } from '../map/map-view.component';
import { FeedStripComponent } from '../map/overlays/feed-strip.component';
import { HoverTooltipComponent } from '../map/overlays/hover-tooltip.component';
import { MapControlsComponent } from '../map/overlays/map-controls.component';
import { AttributionComponent } from '../map/overlays/attribution.component';
import { NearbyListComponent } from '../map/overlays/nearby-list.component';
import { SearchBarComponent } from '../map/overlays/search-bar.component';
import { FilterStore } from '../core/filters/filter.store';
import { PlaybackBarComponent } from '../playback/playback-bar.component';
import { PlaybackService } from '../playback/playback.service';
import { LayersPanelComponent } from '../weather/layers-panel.component';
import { BottomSheetComponent } from '../ui/bottom-sheet.component';
import { IconComponent } from '../ui/icon/icon.component';
import { ConnectionBannerComponent } from '../ui/connection-banner.component';

/** The live map screen: map plus floating glass overlays (design 1a / 2a). */
@Component({
  selector: 'st-map-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AttributionComponent,
    BottomSheetComponent,
    ConnectionBannerComponent,
    FeedStripComponent,
    FlightPanelComponent,
    HoverTooltipComponent,
    IconComponent,
    LayersPanelComponent,
    MapControlsComponent,
    MapViewComponent,
    NearbyListComponent,
    PlaybackBarComponent,
    SearchBarComponent,
  ],
  template: `
    <div class="screen" [class.has-panel]="selected() !== null">
      <st-map-view />
      <st-hover-tooltip />

      <div class="top-left">
        <st-search-bar [showHint]="true" (submitted)="search($event)" />
        <div class="chips">
          <button
            type="button"
            class="chip is-active"
            (click)="filters.open.set(true)"
            data-testid="open-filters"
          >
            <st-icon name="sliders-horizontal" />
            <ng-container i18n="@@map.filters">Filters</ng-container
            >{{ filters.activeCount() > 0 ? ' · ' + filters.activeCount() : '' }}
          </button>
          <button
            type="button"
            class="chip"
            [attr.aria-pressed]="aboveFl200()"
            (click)="toggleAboveFl200()"
          >
            <ng-container i18n="@@map.aboveFl200">Above FL200</ng-container>
          </button>
        </div>
        <st-connection-banner />
      </div>

      <div class="controls">
        <st-map-controls
          (zoom)="zoom($event)"
          (locate)="locate()"
          (history)="openPlayback()"
          (layers)="layersOpen.set(!layersOpen())"
        />
        @if (layersOpen()) {
          <st-layers-panel class="layers" (closed)="layersOpen.set(false)" />
        }
      </div>

      @if (playback.active()) {
        <div class="playback">
          <st-playback-bar />
        </div>
      } @else {
        <div class="feed">
          <st-feed-strip />
        </div>
      }

      @if (selected() !== null) {
        <aside class="detail glass-strong">
          <st-flight-panel />
        </aside>
      }

      <st-attribution class="attribution" />

      <st-bottom-sheet class="sheet">
        @if (selected() !== null) {
          <st-flight-panel class="sheet-panel" />
        } @else {
          <st-nearby-list />
        }
      </st-bottom-sheet>
    </div>
  `,
  styleUrl: './map.page.css',
})
export class MapPage {
  private readonly store = inject(MapUiStore);
  private readonly client = inject(StreamClient);
  private readonly router = inject(Router);
  protected readonly selected = computed(() => this.store.selected());

  protected search(q: string): void {
    if (q.trim() !== '') void this.router.navigate(['/search'], { queryParams: { q } });
  }

  protected zoom(delta: number): void {
    this.store.zoomBy(delta);
  }

  protected locate(): void {
    navigator.geolocation.getCurrentPosition((pos) => {
      this.store.flyTo(pos.coords.latitude, pos.coords.longitude, 9);
    });
  }

  protected readonly connection = this.client.connection;
  protected readonly filters = inject(FilterStore);
  protected readonly playback = inject(PlaybackService);
  protected readonly layersOpen = signal(false);

  protected openPlayback(): void {
    // Before the map reports its bounds, approximate them from centre and zoom.
    const c = this.store.center();
    const half = Math.min(90, 180 / 2 ** c.zoom);
    const fallback: BBox = [
      Math.max(-180, c.lon - half * 1.6),
      Math.max(-90, c.lat - half),
      Math.min(180, c.lon + half * 1.6),
      Math.min(90, c.lat + half),
    ];
    void this.playback.open(this.store.bbox() ?? fallback);
  }
  protected readonly aboveFl200 = computed(
    () => (this.filters.applied().altitude?.[0] ?? 0) >= 20_000,
  );

  /** Quick chip from the design: toggles the altitude floor without opening the panel. */
  protected toggleAboveFl200(): void {
    const f = this.filters.applied();
    if (this.aboveFl200()) {
      const { altitude: _drop, ...rest } = f;
      this.filters.apply(rest);
    } else {
      this.filters.apply({ ...f, altitude: [20_000, 60_000] });
    }
  }
}
