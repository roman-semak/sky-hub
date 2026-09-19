export type StreamMode = 'all' | 'top' | 'clusters';

export interface ZoomPolicy {
  readonly mode: StreamMode;
  /** Minimum spacing between frames for this client, ms. */
  readonly intervalMs: number;
}

/** Aircraft sent in `top` mode besides emergencies, military and watched. */
export const TOP_N = 1500;

/**
 * Zoom degradation table (SPEC § 4.1):
 * ≥ 8 all @ 1 s · 6–7 all @ 2 s · 4–5 top-N by altitude @ 3 s · ≤ 3 clusters @ 5 s.
 */
export function zoomPolicy(zoom: number): ZoomPolicy {
  if (zoom >= 8) return { mode: 'all', intervalMs: 1000 };
  if (zoom >= 6) return { mode: 'all', intervalMs: 2000 };
  if (zoom >= 4) return { mode: 'top', intervalMs: 3000 };
  return { mode: 'clusters', intervalMs: 5000 };
}
