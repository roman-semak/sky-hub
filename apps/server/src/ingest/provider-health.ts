export interface ProviderHealthOptions {
  /** Consecutive failures that open the breaker (SPEC § 1.2: 3). */
  readonly failureThreshold: number;
  /** How long an open breaker excludes the provider, ms (SPEC § 1.2: 60 s). */
  readonly openMs: number;
  /** Upper bound for the adaptive request interval, ms. */
  readonly maxIntervalMs: number;
}

export const DEFAULT_HEALTH_OPTIONS: ProviderHealthOptions = {
  failureThreshold: 3,
  openMs: 60_000,
  maxIntervalMs: 60_000,
};

export interface ProviderHealthSnapshot {
  readonly state: 'closed' | 'open';
  readonly openUntil: number | null;
  readonly intervalMs: number;
  readonly consecutiveFailures: number;
  readonly requests: number;
  readonly ok: number;
  readonly rateLimited: number;
  readonly errors: number;
  readonly lastLatencyMs: number | null;
  readonly lastError: string | null;
}

/**
 * Circuit breaker + AIMD pacing for one provider.
 *
 * Pacing: a 429 doubles the request interval (multiplicative decrease of the
 * rate), each success shrinks it by 5 % towards the configured minimum
 * (additive-ish increase) — the same idea TCP uses to find a link's capacity.
 */
export class ProviderHealth {
  private intervalMs: number;
  private nextAllowedAt = 0;
  private openUntil: number | null = null;
  private consecutiveFailures = 0;
  private inFlight = false;
  private requests = 0;
  private okCount = 0;
  private rateLimited = 0;
  private errors = 0;
  private lastLatencyMs: number | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly minIntervalMs: number,
    private readonly opts: ProviderHealthOptions = DEFAULT_HEALTH_OPTIONS,
  ) {
    this.intervalMs = minIntervalMs;
  }

  isAvailable(now: number): boolean {
    if (this.inFlight) return false;
    if (this.openUntil !== null) {
      if (now < this.openUntil) return false;
      // Half-open: allow one probe; a failure re-opens immediately.
      this.openUntil = null;
      this.consecutiveFailures = this.opts.failureThreshold - 1;
    }
    return now >= this.nextAllowedAt;
  }

  begin(now: number): void {
    this.inFlight = true;
    this.requests++;
    this.nextAllowedAt = now + this.intervalMs;
  }

  succeed(now: number, latencyMs: number): void {
    this.inFlight = false;
    this.okCount++;
    this.consecutiveFailures = 0;
    this.lastLatencyMs = latencyMs;
    this.intervalMs = Math.max(this.minIntervalMs, this.intervalMs * 0.95);
    this.nextAllowedAt = Math.max(this.nextAllowedAt, now);
  }

  fail(now: number, kind: 'rate-limited' | 'error', message: string): void {
    this.inFlight = false;
    this.lastError = message;
    if (kind === 'rate-limited') {
      this.rateLimited++;
      this.intervalMs = Math.min(this.opts.maxIntervalMs, this.intervalMs * 2);
    } else {
      this.errors++;
    }
    this.nextAllowedAt = now + this.intervalMs;
    if (++this.consecutiveFailures >= this.opts.failureThreshold) {
      this.openUntil = now + this.opts.openMs;
    }
  }

  snapshot(now: number): ProviderHealthSnapshot {
    const open = this.openUntil !== null && now < this.openUntil;
    return {
      state: open ? 'open' : 'closed',
      openUntil: open ? this.openUntil : null,
      intervalMs: Math.round(this.intervalMs),
      consecutiveFailures: this.consecutiveFailures,
      requests: this.requests,
      ok: this.okCount,
      rateLimited: this.rateLimited,
      errors: this.errors,
      lastLatencyMs: this.lastLatencyMs,
      lastError: this.lastError,
    };
  }
}
