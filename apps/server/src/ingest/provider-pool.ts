import {
  ProviderHealth,
  type ProviderHealthOptions,
  type ProviderHealthSnapshot,
} from './provider-health.js';
import type { Provider } from './provider.js';

export interface PooledProvider {
  readonly provider: Provider;
  readonly health: ProviderHealth;
}

/**
 * Round-robin over providers that are currently allowed to take a request
 * (breaker closed, pacing interval elapsed, nothing in flight).
 */
export class ProviderPool {
  private readonly members: PooledProvider[];
  private cursor = 0;

  constructor(providers: readonly Provider[], opts?: ProviderHealthOptions) {
    this.members = providers.map((provider) => ({
      provider,
      health: new ProviderHealth(provider.minIntervalMs, opts),
    }));
  }

  /** Next available provider of the requested class, or `null`. */
  acquire(now: number, fallback: boolean): PooledProvider | null {
    const n = this.members.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const m = this.members[idx];
      if (m?.provider.fallbackOnly !== fallback) continue;
      if (m.health.isAvailable(now)) {
        this.cursor = (idx + 1) % n;
        return m;
      }
    }
    return null;
  }

  snapshot(now: number): Record<string, ProviderHealthSnapshot> {
    return Object.fromEntries(this.members.map((m) => [m.provider.id, m.health.snapshot(now)]));
  }
}
