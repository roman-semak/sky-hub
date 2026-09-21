import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FlightPanelComponent } from '../flight/flight-panel.component';
import { StreamClient } from '../core/live/stream-client.service';
import { MapUiStore } from '../core/state/map-ui.store';
import { MapViewComponent } from '../map/map-view.component';
import { FeedStripComponent } from '../map/overlays/feed-strip.component';
import { HoverTooltipComponent } from '../map/overlays/hover-tooltip.component';
import { MapControlsComponent } from '../map/overlays/map-controls.component';
import { NearbyListComponent } from '../map/overlays/nearby-list.component';
import { SearchBarComponent } from '../map/overlays/search-bar.component';
import { BottomSheetComponent } from '../ui/bottom-sheet.component';
import { ConnectionBannerComponent } from '../ui/connection-banner.component';

/** The live map screen: map plus floating glass overlays (design 1a / 2a). */
@Component({
  selector: 'st-map-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BottomSheetComponent,
    ConnectionBannerComponent,
    FeedStripComponent,
    FlightPanelComponent,
    HoverTooltipComponent,
    MapControlsComponent,
    MapViewComponent,
    NearbyListComponent,
    SearchBarComponent,
  ],
  template: `
    <div class="screen" [class.has-panel]="selected() !== null">
      <st-map-view />
      <st-hover-tooltip />

      <div class="top-left">
        <st-search-bar [showHint]="true" (submitted)="search($event)" />
        <st-connection-banner />
      </div>

      <div class="controls">
        <st-map-controls (zoom)="zoom($event)" (locate)="locate()" />
      </div>

      <div class="feed">
        <st-feed-strip />
      </div>

      @if (selected() !== null) {
        <aside class="detail glass-strong">
          <st-flight-panel />
        </aside>
      }

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
    const c = this.store.center();
    this.store.center.set({ ...c, zoom: Math.min(18, Math.max(1, c.zoom + delta)) });
  }

  protected locate(): void {
    navigator.geolocation.getCurrentPosition((pos) => {
      this.store.center.set({ lat: pos.coords.latitude, lon: pos.coords.longitude, zoom: 9 });
    });
  }

  protected readonly connection = this.client.connection;
}
