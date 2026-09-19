import type { EmergencyKind } from '@skytrace/adsb-types';

/**
 * Wire-level view of one aircraft. Values are already quantized to the
 * precision the binary format carries.
 */
export interface AircraftRecord {
  /** ICAO24 as an integer. */
  readonly icao: number;
  readonly nonIcao: boolean;
  /** Degrees, 1e-6 precision. */
  readonly lat: number;
  readonly lon: number;
  /** Feet, 25 ft precision; `null` = unknown. */
  readonly alt: number | null;
  /** Knots, 0.1 kt precision. */
  readonly gs: number | null;
  /** Degrees, 0.01° precision. */
  readonly track: number | null;
  /** ft/min, 8 fpm precision. */
  readonly baroRate: number | null;
  /** Four octal digits, e.g. `"7700"`. */
  readonly squawk: string | null;
  readonly onGround: boolean;
  readonly mlat: boolean;
  readonly tisb: boolean;
  readonly military: boolean;
  readonly special: boolean;
  readonly emergency: EmergencyKind;
  /** ADS-B emitter category `A0`–`D7`. */
  readonly category: string | null;
  /** Seconds between the position fix and the frame timestamp; 255 = stale. */
  readonly age: number;
}
