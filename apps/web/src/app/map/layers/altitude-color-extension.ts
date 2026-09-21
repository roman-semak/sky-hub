import { LayerExtension, type Accessor, type Layer } from '@deck.gl/core';
import { ALT_UNKNOWN, altitudeColorGlsl } from './altitude-color';

export interface AltitudeColorProps<D = unknown> {
  /** Feet; sentinels from `altitude-color.ts` select emergency/selected/unknown colours. */
  getAltitude?: Accessor<D, number>;
}

/**
 * Colours instances by altitude on the GPU (SPEC § 5.2: "як GPU-функцію").
 * The CPU only uploads one float per aircraft; the ramp lives in the vertex
 * shader, generated from the same stops as the CPU reference.
 */
export class AltitudeColorExtension extends LayerExtension {
  static override extensionName = 'AltitudeColorExtension';
  static override defaultProps = { getAltitude: { type: 'accessor', value: ALT_UNKNOWN } };

  override getShaders(): { inject: Record<string, string> } {
    return {
      inject: {
        'vs:#decl': `in float instanceAltitudes;\n${altitudeColorGlsl()}`,
        'vs:DECKGL_FILTER_COLOR': 'color.rgb = altitudeColor(instanceAltitudes);',
      },
    };
  }

  override initializeState(this: Layer<AltitudeColorProps>): void {
    this.getAttributeManager()?.addInstanced({
      instanceAltitudes: { size: 1, accessor: 'getAltitude', defaultValue: ALT_UNKNOWN },
    });
  }
}
