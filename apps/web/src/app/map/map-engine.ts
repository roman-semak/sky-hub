import type { Layer, PickingInfo } from '@deck.gl/core';
import { IconLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { BBox } from '@skytrace/geo';
import type { Cluster } from '@skytrace/protocol';
import { AttributionControl, Map as MlMap, setWorkerUrl } from 'maplibre-gl';
import type { LiveRegistry } from '../core/live/live-registry';
import { AltitudeColorExtension } from './layers/altitude-color-extension';
import { buildIconAtlas } from './layers/icon-atlas';
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

export interface MapEngineOptions {
  readonly container: HTMLElement;
  readonly registry: LiveRegistry;
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
  flyTo(lat: number, lon: number, zoom?: number): void;
  zoomBy(delta: number): void;
  destroy(): void;
}

const ATTRIBUTION =
  'Aircraft data: <a href="https://adsb.lol" target="_blank" rel="noopener">adsb.lol</a>, ' +
  '<a href="https://adsb.fi" target="_blank" rel="noopener">adsb.fi</a> (ODbL) · ' +
  'Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · ' +
  '© <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

// MapLibre resolves its worker next to its own module; after bundling that
// file does not exist, so the worker is shipped as an asset (angular.json).
setWorkerUrl(new URL('maplibre/maplibre-gl-worker.mjs', document.baseURI).href);

/**
 * Creates the WebGL map: MapLibre basemap + deck.gl overlay drawing every
 * aircraft from binary attributes. Loaded lazily so neither library counts
 * towards the initial bundle.
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
  map.addControl(
    new AttributionControl({ compact: true, customAttribution: ATTRIBUTION }),
    'bottom-right',
  );

  const atlas = buildIconAtlas();
  const buffer = new RenderBuffer();
  const extension = new AltitudeColorExtension();
  let selected: string | null = null;
  let hovered: string | null = null;
  let dimmed = false;
  let trail: readonly (readonly [number, number])[] = [];
  let lastVersion = -1;
  let iconVersion = 0;
  let clusters: readonly Cluster[] = [];

  const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
  map.addControl(overlay);

  const emitViewport = (): void => {
    const b = map.getBounds();
    const c = map.getCenter();
    const w = Math.max(-180, b.getWest());
    const e = Math.min(180, b.getEast());
    opts.onViewport({
      bbox: [w, Math.max(-90, b.getSouth()), e, Math.min(90, b.getNorth())],
      zoom: map.getZoom(),
      lat: c.lat,
      lon: c.lng,
    });
  };
  map.on('moveend', emitViewport);
  map.once('load', emitViewport);

  const pickHex = (info: PickingInfo): string | null =>
    info.layer?.id === 'aircraft' && info.index >= 0 ? (buffer.hexes[info.index] ?? null) : null;

  const buildLayers = (): Layer[] => {
    const layers: Layer[] = [];
    if (clusters.length > 0) {
      const maxCount = Math.max(...clusters.map((c) => c.count));
      layers.push(
        new ScatterplotLayer<Cluster>({
          id: 'clusters',
          data: clusters,
          getPosition: (c) => [c.lon, c.lat],
          getRadius: (c) => 6 + 18 * Math.sqrt(c.count / maxCount),
          radiusUnits: 'pixels',
          getFillColor: [150, 138, 224, 90],
          getLineColor: [181, 171, 252, 200],
          lineWidthMinPixels: 1,
          stroked: true,
        }),
        new TextLayer<Cluster>({
          id: 'cluster-counts',
          data: clusters.filter((c) => c.count >= 5),
          getPosition: (c) => [c.lon, c.lat],
          getText: (c) => (c.count >= 1000 ? `${(c.count / 1000).toFixed(1)}k` : String(c.count)),
          getSize: 11,
          getColor: [233, 233, 237, 230],
          fontFamily: 'Inter Variable, Inter, system-ui, sans-serif',
          fontWeight: 600,
        }),
      );
    }
    if (trail.length > 1) {
      layers.push(
        new PathLayer<{ path: [number, number][] }>({
          id: 'trail',
          data: [{ path: trail.map(([lon, lat]) => [lon, lat] as [number, number]) }],
          getPath: (d) => d.path,
          getColor: [150, 138, 224, 200],
          getWidth: 2,
          widthUnits: 'pixels',
          jointRounded: true,
          capRounded: true,
        }),
      );
    }
    layers.push(
      new IconLayer({
        id: 'aircraft',
        data: {
          length: buffer.count,
          attributes: {
            getPosition: { value: buffer.positions, size: 2 },
            getAngle: { value: buffer.angles, size: 1 },
            getColor: { value: buffer.colors, size: 4, normalized: true },
            getSize: { value: buffer.sizes, size: 1 },
            getAltitude: { value: buffer.altitudes, size: 1 },
          },
        },
        iconAtlas: atlas.url,
        iconMapping: atlas.mapping,
        getIcon: (_: unknown, { index }: { index: number }) => buffer.icons[index] ?? 'generic',
        sizeUnits: 'pixels',
        billboard: false,
        pickable: true,
        autoHighlight: false,
        extensions: [extension],
        updateTriggers: { getIcon: iconVersion },
        onClick: (info: PickingInfo) => {
          opts.onSelect(pickHex(info));
        },
        onHover: (info: PickingInfo) => {
          const hex = pickHex(info);
          if (hex !== hovered) {
            hovered = hex;
            map.getCanvas().style.cursor = hex === null ? '' : 'pointer';
          }
          opts.onHover(hex === null ? null : { hex, x: info.x, y: info.y });
        },
      }),
    );
    return layers;
  };

  map.on('click', (e) => {
    const picked = overlay.pickObject({
      x: e.point.x,
      y: e.point.y,
      radius: 6,
      layerIds: ['aircraft'],
    });
    if (picked === null) opts.onSelect(null);
  });

  // Frame loop: project every aircraft, hand the buffers to deck.
  const samples: number[] = [];
  let frames = 0;
  let statsAt = performance.now();
  let raf = 0;
  const frame = (): void => {
    raf = requestAnimationFrame(frame);
    const t0 = performance.now();
    const reg = opts.registry;
    if (reg.version !== lastVersion) {
      lastVersion = reg.version;
      iconVersion++;
      clusters = reg.clusters;
    }
    buffer.fill(reg.aircraft, Date.now(), selected, dimmed);
    overlay.setProps({ layers: buildLayers() });
    samples.push(performance.now() - t0);
    frames++;
    if (t0 - statsAt >= 1000) {
      samples.sort((a, b) => a - b);
      const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
      opts.onFrameStats({ frameMs: Math.round(p95 * 10) / 10, fps: frames, drawn: buffer.count });
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
      trail = points;
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
      cancelAnimationFrame(raf);
      map.removeControl(overlay);
      overlay.finalize();
      map.remove();
    },
  };
}
