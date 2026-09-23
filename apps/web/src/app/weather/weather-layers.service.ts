import { effect, inject, Injectable, signal } from '@angular/core';
import { FETCH_FN } from '../core/live/aircraft-meta.service';
import { MapUiStore } from '../core/state/map-ui.store';
import type { WindGrid } from './wind-field';

export type WindLevel = 850 | 500 | 250;

/** One cell of `/api/heatmap`. */
export interface HeatCell {
  readonly lat: number;
  readonly lon: number;
  readonly count: number;
}

/** Density cells plus the grid step they sit on, which sets the blur radius. */
export interface HeatGrid {
  readonly cellDeg: number;
  readonly cells: readonly HeatCell[];
}

export const WIND_LEVELS: readonly { level: WindLevel; label: string }[] = [
  { level: 850, label: 'FL050' },
  { level: 500, label: 'FL180' },
  { level: 250, label: 'FL340' },
];

interface RainViewerMaps {
  readonly host: string;
  readonly radar: { readonly past: readonly { readonly time: number; readonly path: string }[] };
}

const RAINVIEWER = 'https://api.rainviewer.com/public/weather-maps.json';
/** RainViewer serves radar tiles up to this zoom; the map overzooms beyond. */
export const RADAR_MAX_ZOOM = 7;

/**
 * Optional weather overlays (SPEC § 6): RainViewer precipitation radar and
 * Open-Meteo wind aloft. State lives here; the map engine renders it.
 */
@Injectable({ providedIn: 'root' })
export class WeatherLayersService {
  private readonly fetchFn = inject(FETCH_FN);
  private readonly store = inject(MapUiStore);
  readonly radarOn = signal(false);
  /** Paints military aircraft in their own colour and enlarges them. */
  readonly militaryHighlight = signal(false);
  /** 24 h traffic-density heatmap (SPEC phase 8). */
  readonly heatmapOn = signal(false);
  readonly heatmap = signal<HeatGrid | null>(null);
  /** Terrain + tilted camera, aircraft drawn at their real altitude. */
  readonly threeD = signal(false);
  readonly windOn = signal(false);
  readonly windLevel = signal<WindLevel>(250);
  /** `{z}/{x}/{y}` tile template of the latest radar frame, or `null`. */
  readonly radarTiles = signal<string | null>(null);
  readonly radarTime = signal<number | null>(null);
  readonly wind = signal<WindGrid | null>(null);
  private radarTimer: ReturnType<typeof setInterval> | null = null;
  private windTimer: ReturnType<typeof setTimeout> | null = null;
  private heatTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      if (!this.radarOn()) {
        this.radarTiles.set(null);
        if (this.radarTimer !== null) clearInterval(this.radarTimer);
        this.radarTimer = null;
        return;
      }
      void this.loadRadar();
      // RainViewer publishes a new frame every 10 minutes.
      this.radarTimer ??= setInterval(() => void this.loadRadar(), 10 * 60_000);
    });
    effect(() => {
      const on = this.heatmapOn();
      const bbox = this.store.bbox();
      if (this.heatTimer !== null) clearTimeout(this.heatTimer);
      if (!on || bbox === null) {
        this.heatmap.set(null);
        return;
      }
      this.heatTimer = setTimeout(() => void this.loadHeatmap(bbox), 400);
    });
    effect(() => {
      const on = this.windOn();
      const level = this.windLevel();
      const bbox = this.store.bbox();
      if (this.windTimer !== null) clearTimeout(this.windTimer);
      if (!on || bbox === null) {
        this.wind.set(null);
        return;
      }
      this.windTimer = setTimeout(() => void this.loadWind(bbox, level), 400);
    });
  }

  private async loadHeatmap(bbox: readonly [number, number, number, number]): Promise<void> {
    const params = new URLSearchParams({ bbox: bbox.map((v) => v.toFixed(3)).join(',') });
    try {
      const res = await this.fetchFn(`/api/heatmap?${params.toString()}`);
      if (!res.ok) {
        this.heatmap.set(null);
        return;
      }
      const body = (await res.json()) as { cellDeg: number; cells: HeatCell[] };
      this.heatmap.set({ cellDeg: body.cellDeg, cells: body.cells });
    } catch {
      this.heatmap.set(null);
    }
  }

  private async loadRadar(): Promise<void> {
    try {
      const res = await this.fetchFn(RAINVIEWER);
      if (!res.ok) return;
      const maps = (await res.json()) as RainViewerMaps;
      const latest = maps.radar.past.at(-1);
      if (latest === undefined) return;
      // Colour scheme 2 (universal blue), smoothed, snow shown.
      this.radarTiles.set(`${maps.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`);
      this.radarTime.set(latest.time * 1000);
    } catch {
      // Radar is decorative; failing quietly keeps the map usable.
    }
  }

  private async loadWind(
    bbox: readonly [number, number, number, number],
    level: WindLevel,
  ): Promise<void> {
    const params = new URLSearchParams({
      bbox: bbox.map((v) => v.toFixed(3)).join(','),
      level: String(level),
    });
    try {
      const res = await this.fetchFn(`/api/wind?${params.toString()}`);
      this.wind.set(res.ok ? ((await res.json()) as WindGrid) : null);
    } catch {
      this.wind.set(null);
    }
  }
}
