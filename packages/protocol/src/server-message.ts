import type { EmergencyKind } from '@skytrace/adsb-types';

/** Server → client control messages, JSON text frames. Aircraft data is binary. */
export type ServerMessage =
  | { readonly t: 'hello'; readonly version: 1; readonly serverTime: number }
  /** Latency probe; the client echoes `ts` back in a `pong`. */
  | { readonly t: 'ping'; readonly ts: number }
  /** Round-trip latency the server measured for this client, ms. */
  | { readonly t: 'stats'; readonly rttMs: number | null; readonly inView: number }
  /** Answer to a client `preview`; `id` echoes the request. */
  | { readonly t: 'preview'; readonly id: number; readonly count: number }
  /** New emergency squawks anywhere in coverage (SPEC phase 8). */
  | { readonly t: 'alerts'; readonly items: readonly EmergencyAlert[] }
  | { readonly t: 'error'; readonly message: string };

/** An aircraft squawking an emergency code. */
export interface EmergencyAlert {
  readonly hex: string;
  readonly callsign: string | null;
  readonly squawk: string | null;
  readonly kind: EmergencyKind;
  readonly lat: number;
  readonly lon: number;
  readonly military: boolean;
  /** Unix ms of the fix that raised the alert. */
  readonly at: number;
}
