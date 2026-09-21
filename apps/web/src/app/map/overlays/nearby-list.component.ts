import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { haversineDistance } from '@skytrace/geo';
import { formatAltitude, formatSpeed } from '../../core/format/format';
import { AircraftMetaService } from '../../core/live/aircraft-meta.service';
import { StreamClient } from '../../core/live/stream-client.service';
import { MapUiStore } from '../../core/state/map-ui.store';
import { IconComponent } from '../../ui/icon/icon.component';

const ROWS = 8;

/** "Nearby" rows of the bottom sheet (design 1a), nearest to the map centre. */
@Component({
  selector: 'st-nearby-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="head">
      <span class="title">Nearby</span>
      <span class="live"><span class="live-dot"></span>{{ count() }} live</span>
    </div>
    <ul class="rows">
      @for (row of rows(); track row.hex) {
        <li>
          <button
            type="button"
            [class.is-selected]="row.hex === selected()"
            (click)="select(row.hex)"
          >
            <st-icon name="airplane-in-flight" class="plane" [style.rotate.deg]="row.track" />
            <span class="main">
              <span class="call">{{ row.title }}</span>
              <span class="sub">{{ row.sub }}</span>
            </span>
            <span class="right tabular">
              <span class="alt">{{ row.alt }}</span>
              <span class="speed">{{ row.speed }}</span>
            </span>
          </button>
        </li>
      } @empty {
        <li class="empty">No aircraft in view.</li>
      }
    </ul>
  `,
  styleUrl: './nearby-list.component.css',
})
export class NearbyListComponent {
  private readonly client = inject(StreamClient);
  private readonly store = inject(MapUiStore);
  private readonly metaService = inject(AircraftMetaService);
  protected readonly selected = this.store.selected;
  protected readonly count = this.client.aircraftCount;

  protected readonly rows = computed(() => {
    // `aircraftCount` ticks once per second; that is the refresh rate here.
    this.client.aircraftCount();
    const center = this.store.center();
    const list = [...this.client.registry.aircraft.values()]
      .map((ac) => ({
        ac,
        d: haversineDistance(center.lat, center.lon, ac.record.lat, ac.record.lon),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, ROWS);
    return list.map(({ ac }) => {
      const meta = this.metaService.meta(ac.hex)();
      const r = ac.record;
      return {
        hex: ac.hex,
        title: meta?.callsign ?? ac.hex.toUpperCase(),
        sub:
          [meta?.typeCode, meta?.registration]
            .filter((v) => v !== null && v !== undefined)
            .join(' · ') || '—',
        alt: formatAltitude(r.alt, r.onGround),
        speed: formatSpeed(r.gs),
        track: r.track ?? 0,
      };
    });
  });

  protected select(hex: string): void {
    this.store.select(hex);
  }
}
