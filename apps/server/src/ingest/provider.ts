import type { Aircraft } from '@skytrace/adsb-types';
import type { CoverageCircle } from '@skytrace/geo';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type ProviderOutcome =
  | { readonly kind: 'ok'; readonly aircraft: readonly Aircraft[]; readonly invalid: number }
  /** 429 / 420 — slow down. */
  | { readonly kind: 'rate-limited'; readonly status: number }
  /** 5xx, network error, timeout, broken body. */
  | { readonly kind: 'error'; readonly status: number | null; readonly message: string };

/** Something that can return the aircraft inside a coverage circle. */
export interface Provider {
  readonly id: string;
  /** Minimum spacing between requests when healthy, ms. */
  readonly minIntervalMs: number;
  /** Fallback providers are only used for circles community networks do not cover. */
  readonly fallbackOnly: boolean;
  fetchCircle(circle: CoverageCircle, signal: AbortSignal): Promise<ProviderOutcome>;
}

export const USER_AGENT = 'SkyTrace/0.1 (non-commercial open-source flight tracker)';
