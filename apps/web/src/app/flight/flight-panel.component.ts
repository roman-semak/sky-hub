import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import {
  formatAltitude,
  formatCoord,
  formatSpeed,
  formatTrack,
  formatVerticalRate,
} from '../core/format/format';
import { AircraftMetaService } from '../core/live/aircraft-meta.service';
import { StreamClient } from '../core/live/stream-client.service';
import { MapUiStore } from '../core/state/map-ui.store';
import { IconComponent } from '../ui/icon/icon.component';

/** Readouts refresh at 4 Hz; nothing else in the DOM changes per frame. */
const TICK_MS = 250;

/**
 * Flight detail (design 1b / 2a right panel). Phase 3 shows what the position
 * stream carries; route, history and charts arrive with phases 4–5.
 */
@Component({
  selector: 'st-flight-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (flight(); as f) {
      <section class="panel" aria-label="Flight detail">
        <header>
          <div class="ident">
            <h1>{{ f.title }}</h1>
            <p class="sub">{{ f.sub }}</p>
          </div>
          <span class="status" [class.emergency]="f.emergency">{{ f.status }}</span>
        </header>

        <div class="tiles">
          @for (tile of f.tiles; track tile.label) {
            <div class="tile">
              <span class="eyebrow">{{ tile.label }}</span>
              <span class="value tabular">{{ tile.value }}</span>
            </div>
          }
        </div>

        <dl class="raw">
          @for (row of f.raw; track row[0]) {
            <div class="raw-row">
              <dt>{{ row[0] }}</dt>
              <dd class="tabular">{{ row[1] }}</dd>
            </div>
          }
        </dl>

        <div class="actions">
          <button type="button" class="follow" (click)="toggleFollow()">
            <st-icon name="bookmark-simple" />
            {{ following() ? 'Following' : 'Follow' }}
          </button>
          <a
            class="icon-action"
            [href]="f.photoUrl"
            target="_blank"
            rel="noopener"
            title="Photos on planespotters.net"
            aria-label="Photos on planespotters.net"
          >
            <st-icon name="arrow-up-right" />
          </a>
          <button type="button" class="icon-action" (click)="close()" aria-label="Close">
            <st-icon name="x-circle" />
          </button>
        </div>
      </section>
    }
  `,
  styleUrl: './flight-panel.component.css',
})
export class FlightPanelComponent {
  private readonly store = inject(MapUiStore);
  private readonly client = inject(StreamClient);
  private readonly metaService = inject(AircraftMetaService);
  private readonly tick = signal(0);
  protected readonly following = signal(false);

  constructor() {
    const timer = setInterval(() => {
      this.tick.update((t) => t + 1);
    }, TICK_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
    });
  }

  protected readonly flight = computed(() => {
    this.tick();
    const hex = this.store.selected();
    if (hex === null) return null;
    const ac = this.client.registry.aircraft.get(hex);
    if (ac === undefined) return null;
    const r = ac.record;
    const meta = this.metaService.meta(hex)();
    const ageSec = Math.round((Date.now() - ac.fixTime) / 1000);
    return {
      title: meta?.callsign ?? hex.toUpperCase(),
      sub: [meta?.registration, meta?.typeCode, hex.toUpperCase()].filter(Boolean).join(' · '),
      emergency: r.emergency !== 'none',
      status: r.emergency !== 'none' ? r.emergency : r.onGround ? 'On ground' : 'En route',
      tiles: [
        { label: 'Altitude', value: formatAltitude(r.alt, r.onGround) },
        { label: 'Ground speed', value: formatSpeed(r.gs) },
        { label: 'Track', value: formatTrack(r.track) },
        { label: 'Vertical', value: formatVerticalRate(r.baroRate) },
      ],
      raw: [
        ['Position', formatCoord(r.lat, r.lon)],
        ['Squawk', r.squawk ?? '—'],
        ['Category', r.category ?? '—'],
        ['Source', r.mlat ? 'MLAT' : r.tisb ? 'TIS-B' : 'ADS-B'],
        ['Last fix', `${ageSec} s ago`],
      ] as const,
      photoUrl: `https://www.planespotters.net/hex/${hex.replace('~', '').toUpperCase()}`,
    };
  });

  protected toggleFollow(): void {
    const hex = this.store.selected();
    if (hex === null) return;
    const next = !this.following();
    this.following.set(next);
    if (next) this.client.watch(hex);
    else this.client.unwatch(hex);
  }

  protected close(): void {
    this.store.select(null);
  }
}
