export interface BackoffOptions {
  readonly baseMs: number;
  readonly maxMs: number;
  /** Fraction of the delay randomized, `[0, 1]`. */
  readonly jitter: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 500, maxMs: 30_000, jitter: 0.3 };

/**
 * Exponential backoff with jitter: `min(max, base · 2^attempt) · (1 ± jitter)`.
 * Jitter spreads reconnects so a server restart is not hit by every client
 * in the same millisecond.
 *
 * @see https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 */
export function backoffDelay(
  attempt: number,
  opts: BackoffOptions = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number {
  const exp = Math.min(opts.maxMs, opts.baseMs * 2 ** Math.max(0, attempt));
  const spread = exp * opts.jitter;
  return Math.round(exp - spread + random() * 2 * spread);
}
