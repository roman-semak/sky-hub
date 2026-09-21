import type { Layer, PickingInfo } from '@deck.gl/core';
import { IconLayer, LineLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { Cluster } from '@skytrace/protocol';
import type { Map as MlMap } from 'maplibre-gl';
import type { WindParticles } from '../weather/wind-field';
import { AltitudeColorExtension } from './layers/altitude-color-extension';
import { buildIconAtlas } from './layers/icon-atlas';
import type { RenderBuffer } from './layers/render-buffer';

/** Everything the deck layers draw; owned and mutated by the map engine. */
export interface DeckScene {
  readonly buffer: RenderBuffer;
  particles: WindParticles | null;
  clusters: readonly Cluster[];
  trail: readonly (readonly [number, number])[];
  hoverTrail: readonly (readonly [number, number])[];
  iconVersion: number;
}

export interface DeckCallbacks {
  readonly onSelect: (hex: string | null) => void;
  readonly onHover: (hex: string | null, x: number, y: number) => void;
}

export interface DeckOverlay {
  /** Rebuilds the layer list from the scene; called once per animation frame. */
  render(): void;
  /** Whether an aircraft is within `radius` px of a screen point. */
  hitsAircraft(x: number, y: number): boolean;
  destroy(): void;
}

type Path = readonly (readonly [number, number])[];

const toPath = (p: Path): [number, number][] => p.map(([lon, lat]) => [lon, lat]);

/**
 * The deck.gl half of the map (ADR-005, ADR-009). Kept in its own lazy chunk
 * so MapLibre can paint the basemap before deck.gl's ~0.5 MB is evaluated.
 */
export function createDeckOverlay(map: MlMap, scene: DeckScene, cb: DeckCallbacks): DeckOverlay {
  const atlas = buildIconAtlas();
  const extension = new AltitudeColorExtension();
  const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
  map.addControl(overlay);
  let hovered: string | null = null;

  const pickHex = (info: PickingInfo): string | null =>
    info.layer?.id === 'aircraft' && info.index >= 0
      ? (scene.buffer.hexes[info.index] ?? null)
      : null;

  const layers = (): Layer[] => {
    const out: Layer[] = [];
    const { buffer, particles, clusters, trail, hoverTrail } = scene;
    if (particles !== null) {
      out.push(
        new LineLayer({
          id: 'wind',
          data: {
            length: particles.count,
            attributes: {
              getSourcePosition: { value: particles.tail, size: 2 },
              getTargetPosition: { value: particles.head, size: 2 },
              getColor: { value: particles.alpha, size: 4, normalized: true },
            },
          },
          getWidth: 1.2,
          widthUnits: 'pixels',
        }),
      );
    }
    if (clusters.length > 0) {
      const maxCount = Math.max(...clusters.map((c) => c.count));
      out.push(
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
    if (hoverTrail.length > 1) {
      out.push(
        new PathLayer<{ path: [number, number][] }>({
          id: 'hover-trail',
          data: [{ path: toPath(hoverTrail) }],
          getPath: (d) => d.path,
          getColor: [233, 233, 237, 90],
          getWidth: 1.5,
          widthUnits: 'pixels',
        }),
      );
    }
    if (trail.length > 1) {
      out.push(
        new PathLayer<{ path: [number, number][] }>({
          id: 'trail',
          data: [{ path: toPath(trail) }],
          getPath: (d) => d.path,
          getColor: [150, 138, 224, 200],
          getWidth: 2,
          widthUnits: 'pixels',
          jointRounded: true,
          capRounded: true,
        }),
      );
    }
    out.push(
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
        updateTriggers: { getIcon: scene.iconVersion },
        onClick: (info: PickingInfo) => {
          cb.onSelect(pickHex(info));
        },
        onHover: (info: PickingInfo) => {
          const hex = pickHex(info);
          if (hex !== hovered) {
            hovered = hex;
            map.getCanvas().style.cursor = hex === null ? '' : 'pointer';
          }
          cb.onHover(hex, info.x, info.y);
        },
      }),
    );
    return out;
  };

  return {
    render() {
      overlay.setProps({ layers: layers() });
    },
    hitsAircraft(x, y) {
      return overlay.pickObject({ x, y, radius: 6, layerIds: ['aircraft'] }) !== null;
    },
    destroy() {
      map.removeControl(overlay);
      overlay.finalize();
    },
  };
}
