import {
  DEFAULT_DR_OPTIONS,
  renderPoseInto,
  stalenessOpacity,
  type MutablePose,
} from '@skytrace/geo';
import type { LiveAircraft } from '../../core/live/live-aircraft';
import { ALT_EMERGENCY, ALT_MILITARY, ALT_SELECTED, ALT_UNKNOWN } from './altitude-color';
import { SILHOUETTE_SCALE, type SilhouetteId } from './silhouettes';

const BASE_SIZE = 22;
const SELECTED_SIZE = 32;

/**
 * Structure-of-arrays render state handed to deck.gl as binary attributes.
 * Filled once per animation frame without allocating per aircraft.
 */
export class RenderBuffer {
  count = 0;
  positions = new Float32Array(0);
  angles = new Float32Array(0);
  altitudes = new Float32Array(0);
  colors = new Uint8Array(0);
  sizes = new Float32Array(0);
  hexes: string[] = [];
  icons: SilhouetteId[] = [];
  private readonly pose: MutablePose = { lat: 0, lon: 0, heading: 0 };
  private highlightMilitary = false;

  private ensure(n: number): void {
    if (this.angles.length >= n) return;
    const cap = Math.max(1024, Math.ceil(n * 1.5));
    this.positions = new Float32Array(cap * 2);
    this.angles = new Float32Array(cap);
    this.altitudes = new Float32Array(cap);
    this.colors = new Uint8Array(cap * 4).fill(255);
    this.sizes = new Float32Array(cap);
  }

  /**
   * Projects every aircraft to `nowMs`. The selected aircraft is written last
   * so it draws on top.
   */
  fill(
    aircraft: ReadonlyMap<string, LiveAircraft>,
    nowMs: number,
    selected: string | null,
    dimmed: boolean,
    highlightMilitary = false,
  ): void {
    this.highlightMilitary = highlightMilitary;
    this.ensure(aircraft.size);
    this.hexes.length = 0;
    this.icons.length = 0;
    let i = 0;
    let sel: LiveAircraft | undefined;
    for (const ac of aircraft.values()) {
      if (ac.hex === selected) {
        sel = ac;
        continue;
      }
      if (this.write(i, ac, nowMs, false, dimmed)) i++;
    }
    if (sel !== undefined && this.write(i, sel, nowMs, true, dimmed)) i++;
    this.count = i;
  }

  private write(
    i: number,
    ac: LiveAircraft,
    nowMs: number,
    selected: boolean,
    dimmed: boolean,
  ): boolean {
    const opacity = stalenessOpacity((nowMs - ac.fixTime) / 1000);
    if (opacity === 0) return false;
    renderPoseInto(ac.track, nowMs, DEFAULT_DR_OPTIONS, this.pose);
    const r = ac.record;
    this.positions[i * 2] = this.pose.lon;
    this.positions[i * 2 + 1] = this.pose.lat;
    // deck.gl angles are counter-clockwise; headings are clockwise from north.
    this.angles[i] = -this.pose.heading;
    this.altitudes[i] = selected
      ? ALT_SELECTED
      : r.emergency !== 'none'
        ? ALT_EMERGENCY
        : this.highlightMilitary && r.military
          ? ALT_MILITARY
          : r.onGround
            ? 0
            : (r.alt ?? ALT_UNKNOWN);
    this.colors[i * 4 + 3] = Math.round(255 * opacity * (dimmed ? 0.3 : 1));
    const scale = this.highlightMilitary && r.military ? 1.35 : 1;
    this.sizes[i] = selected ? SELECTED_SIZE : BASE_SIZE * SILHOUETTE_SCALE[ac.silhouette] * scale;
    this.hexes[i] = ac.hex;
    this.icons[i] = ac.silhouette;
    return true;
  }
}
