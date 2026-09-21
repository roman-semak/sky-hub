import { SILHOUETTE_IDS, SILHOUETTE_PATHS, type SilhouetteId } from './silhouettes';

export interface IconFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly mask: true;
  readonly anchorX: number;
  readonly anchorY: number;
}

export interface IconAtlas {
  /** Data URL of the rasterized atlas, consumed by deck.gl's IconLayer. */
  readonly url: string;
  readonly mapping: Readonly<Record<SilhouetteId, IconFrame>>;
}

const CELL = 64;
const PAD = 2;

/**
 * Rasterizes every silhouette into one texture atlas (SPEC § 5.2). Icons are
 * white masks so the layer can tint them per instance on the GPU. Drawn at
 * 2× for crisp rendering on HiDPI screens.
 */
export function buildIconAtlas(scale = 2): IconAtlas {
  const cell = (CELL + PAD * 2) * scale;
  const cols = 4;
  const rows = Math.ceil(SILHOUETTE_IDS.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');
  const mapping = {} as Record<SilhouetteId, IconFrame>;
  SILHOUETTE_IDS.forEach((id, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    if (ctx !== null) {
      ctx.save();
      ctx.translate(x + PAD * scale, y + PAD * scale);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#fff';
      // A dark halo keeps light icons readable over light map areas.
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 2;
      ctx.fill(new Path2D(SILHOUETTE_PATHS[id]));
      ctx.restore();
    }
    mapping[id] = {
      x,
      y,
      width: cell,
      height: cell,
      mask: true,
      anchorX: cell / 2,
      anchorY: cell / 2,
    };
  });
  return { url: canvas.toDataURL('image/png'), mapping };
}
