import type { BBox } from '@skytrace/geo';
import { Map as MlMap, setWorkerUrl } from 'maplibre-gl';
import type { LiveRegistry } from '../core/live/live-registry';
import { WindParticles, type WindGrid } from '../weather/wind-field';
import type { DeckOverlay, DeckScene } from './deck-layers';
import { RenderBuffer } from './layers/render-buffer';
import { loadMapStyle, type MapTheme } from './map-style';

export interface Viewport {
  readonly bbox: BBox;
  readonly zoom: number;
  readonly lat: number;
  readonly lon: number;
}

export interface HoverInfo {
  readonly hex: string;
  readonly x: number;
  readonly y: number;
}

export interface FrameStats {
  /** p95 of CPU time per frame over the last second, ms. */
  readonly frameMs: number;
  /** Frames actually rendered in the last second. */
  readonly fps: number;
  readonly drawn: number;
}

/** What the render loop draws: live data, or playback on a virtual clock. */
export interface FrameSource {
  readonly registry: LiveRegistry;
  /** "Now" for dead reckoning, unix ms. */
  readonly now: number;
}

export interface MapEngineOptions {
  readonly container: HTMLElement;
  /** Called once per animation frame; lets the host switch live ↔ playback. */
  readonly frameSource: () => FrameSource;
  readonly center: { lat: number; lon: number; zoom: number };
  readonly theme: MapTheme;
  readonly onViewport: (v: Viewport) => void;
  readonly onSelect: (hex: string | null) => void;
  readonly onHover: (h: HoverInfo | null) => void;
  readonly onFrameStats: (s: FrameStats) => void;
  /** Right-side inset reserved for the detail panel, px (camera padding). */
  readonly rightInset: () => number;
}

export interface MapEngine {
  setTheme(theme: MapTheme): Promise<void>;
  setSelected(hex: string | null): void;
  setDimmed(dimmed: boolean): void;
  setTrail(points: readonly (readonly [number, number])[]): void;
  setHoverTrail(points: readonly (readonly [number, number])[]): void;
  /** `{z}/{x}/{y}` raster tile template for precipitation radar, or `null`. */
  setRadar(tiles: string | null, maxZoom: number): void;
  setWind(grid: WindGrid | null): void;
  setMilitaryHighlight(on: boolean): void;
  flyTo(lat: number, lon: number, zoom?: number): void;
  zoomBy(delta: number): void;
  destroy(): void;
}

// MapLibre resolves its worker next to its own module; after bundling that
// file does not exist, so the worker is shipped as an asset (angular.json).
setWorkerUrl(new URL('maplibre/maplibre-gl-worker.mjs', document.baseURI).href);

/** Lets the browser paint and handle input between two heavy steps. */
const yieldToMain = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Creates the WebGL map: MapLibre basemap first, then the deck.gl overlay
 * that draws every aircraft from binary attributes. Both are lazy chunks;
 * deck.gl loads only after the basemap is up, so neither big library is
 * evaluated in the same long task (ADR-009). Attribution is rendered by the
 * host page, not by MapLibre, so it paints with the first frame.
 */
export async function createMapEngine(opts: MapEngineOptions): Promise<MapEngine> {
  const style = await loadMapStyle(opts.theme);
  const map = new MlMap({
    container: opts.container,
    style,
    center: [opts.center.lon, opts.center.lat],
    zoom: opts.center.zoom,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    maxPitch: 0,
    fadeDuration: 0,
  });
  map.touchZoomRotate.disableRotation();

  const scene: DeckScene = {
    buffer: new RenderBuffer(),
    particles: null,
    clusters: [],
    trail: [],
    hoverTrail: [],
    iconVersion: 0,
  };
  let deck: DeckOverlay | null = null;
  let destroyed = false;
  let selected: string | null = null;
  let dimmed = false;
  let militaryHighlight = false;
  let lastRegistry: LiveRegistry | null = null;
  let lastVersion = -1;
  let radar: { tiles: string; maxZoom: number } | null = null;
  let windGrid: WindGrid | null = null;
  let lastFrameAt = performance.now();

  const viewBox = (): [number, number, number, number] => {
    const b = map.getBounds();
    return [
      Math.max(-180, b.getWest()),
      Math.max(-85, b.getSouth()),
      Math.min(180, b.getEast()),
      Math.min(85, b.getNorth()),
    ];
  };

  // Raster sources vanish with setStyle (theme switch); re-add them each time.
  const applyRadar = (): void => {
    if (map.getLayer('radar') !== undefined) map.removeLayer('radar');
    if (map.getSource('radar') !== undefined) map.removeSource('radar');
    if (radar === null) return;
    map.addSource('radar', {
      type: 'raster',
      tiles: [radar.tiles],
      tileSize: 256,
      maxzoom: radar.maxZoom,
    });
    map.addLayer({
      id: 'radar',
      type: 'raster',
      source: 'radar',
      paint: { 'raster-opacity': 0.55 },
    });
  };
  map.on('style.load', applyRadar);
  map.on('moveend', () => {
    scene.particles?.setView(viewBox());
  });

  const emitViewport = (): void => {
    const b = map.getBounds();
    const c = map.getCenter();
    opts.onViewport({
      bbox: [
        Math.max(-180, b.getWest()),
        Math.max(-90, b.getSouth()),
        Math.min(180, b.getEast()),
        Math.min(90, b.getNorth()),
      ],
      zoom: map.getZoom(),
      lat: c.lat,
      lon: c.lng,
    });
  };
  map.on('moveend', emitViewport);
  map.once('load', () => {
    emitViewport();
    void (async () => {
      await yieldToMain();
      const { createDeckOverlay } = await import('./deck-layers');
      await yieldToMain();
      if (destroyed) return;
      deck = createDeckOverlay(map, scene, {
        onSelect: opts.onSelect,
        onHover: (hex, x, y) => {
          opts.onHover(hex === null ? null : { hex, x, y });
        },
      });
    })();
  });

  map.on('click', (e) => {
    if (deck !== null && !deck.hitsAircraft(e.point.x, e.point.y)) opts.onSelect(null);
  });

  // Frame loop: project every aircraft, hand the buffers to deck.
  const samples: number[] = [];
  let frames = 0;
  let statsAt = performance.now();
  let raf = 0;
  const frame = (): void => {
    raf = requestAnimationFrame(frame);
    const t0 = performance.now();
    if (scene.particles !== null && windGrid !== null) {
      // 30 m/s crosses ~4 % of the view per second: visible, not literal.
      const [w, , e] = viewBox();
      scene.particles.step(windGrid, Math.min(50, t0 - lastFrameAt), (0.04 * (e - w)) / 30_000);
    }
    lastFrameAt = t0;
    const source = opts.frameSource();
    const reg = source.registry;
    if (reg !== lastRegistry || reg.version !== lastVersion) {
      lastRegistry = reg;
      lastVersion = reg.version;
      scene.iconVersion++;
      scene.clusters = reg.clusters;
    }
    if (deck === null) return;
    scene.buffer.fill(reg.aircraft, source.now, selected, dimmed, militaryHighlight);
    deck.render();
    samples.push(performance.now() - t0);
    frames++;
    if (t0 - statsAt >= 1000) {
      samples.sort((a, b) => a - b);
      const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
      opts.onFrameStats({
        frameMs: Math.round(p95 * 10) / 10,
        fps: frames,
        drawn: scene.buffer.count,
      });
      samples.length = 0;
      frames = 0;
      statsAt = t0;
    }
  };
  raf = requestAnimationFrame(frame);

  return {
    async setTheme(theme) {
      map.setStyle(await loadMapStyle(theme));
    },
    setSelected(hex) {
      selected = hex;
    },
    setDimmed(d) {
      dimmed = d;
    },
    setTrail(points) {
      scene.trail = points;
    },
    setHoverTrail(points) {
      scene.hoverTrail = points;
    },
    setRadar(tiles, maxZoom) {
      radar = tiles === null ? null : { tiles, maxZoom };
      if (map.isStyleLoaded()) applyRadar();
    },
    setMilitaryHighlight(on) {
      militaryHighlight = on;
    },
    setWind(grid) {
      windGrid = grid;
      if (grid === null) scene.particles = null;
      else scene.particles ??= new WindParticles(1500, viewBox());
    },
    flyTo(lat, lon, zoom) {
      const reduced = globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
      map.easeTo({
        center: [lon, lat],
        zoom: zoom ?? map.getZoom(),
        duration: reduced ? 0 : 600,
        padding: { right: opts.rightInset(), top: 0, bottom: 0, left: 0 },
      });
    },
    zoomBy(delta) {
      map.easeTo({ zoom: map.getZoom() + delta, duration: 250 });
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      deck?.destroy();
      map.remove();
    },
  };
}
