import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { formatAltitude, formatSpeed } from '../../core/format/format';
import { AircraftMetaService } from '../../core/live/aircraft-meta.service';
import { StreamClient } from '../../core/live/stream-client.service';
import { MapUiStore } from '../../core/state/map-ui.store';

/** Hover readout. Only the hovered aircraft touches the DOM (design note). */
@Component({
  selector: 'st-hover-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (info(); as ac) {
      <div class="tip glass" role="status" [style.left.px]="ac.x" [style.top.px]="ac.y">
        <span class="call">{{ ac.title }}</span>
        <span class="meta tabular">{{ ac.alt }} · {{ ac.speed }}</span>
      </div>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .tip {
      position: absolute;
      transform: translate(14px, -50%);
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 11px;
      border-radius: 12px;
      pointer-events: none;
    }
    .call {
      font-size: 13px;
      font-weight: 600;
    }
    .meta {
      font-size: 12px;
      color: var(--color-neutral-400);
    }
  `,
})
export class HoverTooltipComponent {
  private readonly store = inject(MapUiStore);
  private readonly client = inject(StreamClient);
  private readonly metaService = inject(AircraftMetaService);

  protected readonly info = computed(() => {
    const hover = this.store.hovered();
    if (hover === null) return null;
    const ac = this.client.registry.aircraft.get(hover.hex);
    if (ac === undefined) return null;
    const meta = this.metaService.meta(hover.hex)();
    const r = ac.record;
    return {
      title: meta?.callsign ?? meta?.registration ?? hover.hex.toUpperCase(),
      alt: formatAltitude(r.alt, r.onGround),
      speed: formatSpeed(r.gs),
      x: hover.x,
      y: hover.y,
    };
  });
}
