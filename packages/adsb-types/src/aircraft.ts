export type EmergencyKind =
  'none' | 'general' | 'lifeguard' | 'minfuel' | 'nordo' | 'unlawful' | 'downed' | 'reserved';

/** Provider-agnostic aircraft state used by the server and the client. */
export interface Aircraft {
  /** ICAO24 address, lower-case. A leading `~` marks a non-ICAO (TIS-B/ADS-R) address. */
  readonly hex: string;
  readonly callsign: string | null;
  readonly registration: string | null;
  readonly typeCode: string | null;
  readonly lat: number;
  readonly lon: number;
  /** Barometric altitude in feet; `null` when unknown. 0 when on ground. */
  readonly altBaro: number | null;
  readonly altGeom: number | null;
  readonly onGround: boolean;
  /** Ground speed, knots. */
  readonly gs: number | null;
  /** Track over ground, degrees true. */
  readonly track: number | null;
  /** Vertical rate, ft/min. */
  readonly baroRate: number | null;
  readonly squawk: string | null;
  readonly emergency: EmergencyKind;
  /** ADS-B emitter category, `A0`–`D7`. */
  readonly category: string | null;
  readonly navAltitudeMcp: number | null;
  readonly messages: number;
  readonly rssi: number | null;
  readonly mlat: boolean;
  readonly tisb: boolean;
  readonly military: boolean;
  readonly ladd: boolean;
  readonly pia: boolean;
  /** Unix ms of the last position fix. */
  readonly posTime: number;
  /** Unix ms of the last message of any kind. */
  readonly seenTime: number;
}
