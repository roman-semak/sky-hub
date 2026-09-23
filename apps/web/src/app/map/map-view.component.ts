import type { ElementRef } from '@angular/core';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FlightDataService } from '../core/flight/flight-data.service';
import { StreamClient } from '../core/live/stream-client.service';
import { PlaybackService } from '../playback/playback.service';
import { RADAR_MAX_ZOOM, WeatherLayersService } from '../weather/weather-layers.service';
import { MapUiStore } from '../core/state/map-ui.store';
import { ThemeService } from '../core/theme/theme.service';
import type { MapEngine } from './map-engine';

/** Width reserved by the desktop detail panel, used for camera padding. */
const PANEL_INSET = 392;
const TRAIL_LIMIT = 600;

/**
 * Hosts the WebGL map. MapLibre and deck.gl live in a lazily imported chunk
 * so they never enter the initial bundle (ADR-005).
 */
@Component({
  selector: 'st-map-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #container class="map" data-testid="map-canvas"></div>
    @if (failed()) {
      <p class="map-error" role="status" i18n="@@map.failed">
        Map failed to load. Live data is still streaming.
      </p>
    }
  `,
  styles: `
    :host,
    .map {
      position: absolute;
      inset: 0;
    }
    .map-error {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      color: var(--color-neutral-300);
    }
  `,
})
export class MapViewComponent {
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');
  private readonly store = inject(MapUiStore);
  private readonly client = inject(StreamClient);
  private readonly themeService = inject(ThemeService);
  private readonly playback = inject(PlaybackService);
  private readonly flightData = inject(FlightDataService);
  private readonly weather = inject(WeatherLayersService);
  /** Recorded track of the selected aircraft, from `/api/track`. */
  private history: [number, number][] = [];
  private engine: MapEngine | null = null;
  private trail: [number, number][] = [];
  private trailTimer: ReturnType<typeof setInterval> | null = null;
  protected readonly failed = signal(false);
  /** Flips once the engine exists so effects re-run and push their state into it. */
  protected readonly engineReady = signal(false);

  constructor() {
    afterNextRender(() => {
      void this.boot();
    });

    effect(() => {
      const theme = this.themeService.theme();
      void this.engine?.setTheme(theme);
    });

    effect(() => {
      const hex = this.store.selected();
      this.trail = [];
      this.history = [];
      this.engine?.setSelected(hex);
      this.engine?.setTrail([]);
      if (hex === null) return;
      this.client.watch(hex);
      const ac = this.client.registry.aircraft.get(hex);
      if (ac !== undefined) this.engine?.flyTo(ac.record.lat, ac.record.lon);
      // The trail starts with the recorded last hour, then grows live.
      void this.flightData.track(hex).then((r) => {
        if (r === null || this.store.selected() !== hex) return;
        this.history = r.points.map((p) => [p.lon, p.lat]);
        this.engine?.setTrail([...this.history, ...this.trail]);
      });
    });

    effect(() => {
      const tiles = this.weather.radarTiles();
      this.engineReady();
      this.engine?.setRadar(tiles, RADAR_MAX_ZOOM);
    });
    effect(() => {
      const on = this.weather.militaryHighlight();
      this.engineReady();
      this.engine?.setMilitaryHighlight(on);
    });
    effect(() => {
      const grid = this.weather.wind();
      this.engineReady();
      this.engine?.setWind(grid);
    });

    // Hover trail (SPEC § 5.2): only for the aircraft under the cursor.
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;
    effect(() => {
      const hex = this.store.hovered()?.hex ?? null;
      if (hoverTimer !== null) clearTimeout(hoverTimer);
      this.engine?.setHoverTrail([]);
      if (hex === null || hex === this.store.selected()) return;
      hoverTimer = setTimeout(() => {
        void this.flightData.track(hex).then((r) => {
          if (r !== null && this.store.hovered()?.hex === hex) {
            this.engine?.setHoverTrail(r.points.map((p) => [p.lon, p.lat]));
          }
        });
      }, 300);
    });

    effect(() => {
      const cmd = this.store.camera();
      if (cmd === null || this.engine === null) return;
      if (cmd.kind === 'fly') this.engine.flyTo(cmd.lat, cmd.lon, cmd.zoom ?? undefined);
      else this.engine.zoomBy(cmd.delta);
    });

    inject(DestroyRef).onDestroy(() => {
      if (this.trailTimer !== null) clearInterval(this.trailTimer);
      this.engine?.destroy();
      this.engine = null;
    });
  }

  private async boot(): Promise<void> {
    const { createMapEngine } = await import('./map-engine');
    const center = this.store.center();
    try {
      this.engine = await createMapEngine({
        container: this.container().nativeElement,
        frameSource: () => {
          if (this.playback.active()) {
            this.playback.step();
            return { registry: this.playback.registry, now: this.playback.clock() };
          }
          return { registry: this.client.registry, now: Date.now() };
        },
        center,
        theme: this.themeService.theme(),
        rightInset: () => (globalThis.innerWidth >= 1200 ? PANEL_INSET : 0),
        onViewport: (v) => {
          this.store.center.set({ lat: v.lat, lon: v.lon, zoom: v.zoom });
          this.store.bbox.set(v.bbox);
          this.client.subscribe(v.bbox, Math.round(v.zoom));
        },
        onSelect: (hex) => {
          this.store.select(hex);
        },
        onHover: (h) => {
          this.store.hovered.set(h === null ? null : { hex: h.hex, x: h.x, y: h.y });
        },
        onFrameStats: (s) => {
          this.store.frameMs.set(s.frameMs);
          this.store.fps.set(s.fps);
          this.store.drawn.set(s.drawn);
        },
      });
      this.engine.setSelected(this.store.selected());
      this.engineReady.set(true);
      this.trailTimer = setInterval(() => {
        this.sampleTrail();
      }, 1000);
    } catch {
      this.failed.set(true);
    }
  }

  /** Breadcrumbs of the selected aircraft since it was selected (SPEC § 5.2). */
  private sampleTrail(): void {
    const hex = this.store.selected();
    if (hex === null || this.engine === null) return;
    const ac = this.client.registry.aircraft.get(hex);
    if (ac === undefined) return;
    const last = this.trail.at(-1);
    if (last?.[0] === ac.record.lon && last[1] === ac.record.lat) return;
    this.trail.push([ac.record.lon, ac.record.lat]);
    if (this.trail.length > TRAIL_LIMIT) this.trail.shift();
    this.engine.setTrail([...this.history, ...this.trail]);
  }
}
