import { describe, expect, it } from 'vitest';
import type { Provider } from '../src/ingest/provider.js';
import { ProviderPool } from '../src/ingest/provider-pool.js';

const fake = (id: string, fallbackOnly = false): Provider => ({
  id,
  minIntervalMs: 1000,
  fallbackOnly,
  fetchCircle: () => Promise.resolve({ kind: 'ok', aircraft: [], invalid: 0 }),
});

describe('ProviderPool', () => {
  it('rotates between available providers of the requested class', () => {
    const pool = new ProviderPool([fake('a'), fake('b'), fake('sky', true)]);
    const first = pool.acquire(0, false);
    first?.health.begin(0);
    const second = pool.acquire(0, false);
    second?.health.begin(0);
    expect([first?.provider.id, second?.provider.id]).toEqual(['a', 'b']);
    expect(pool.acquire(0, false)).toBeNull();
    expect(pool.acquire(0, true)?.provider.id).toBe('sky');
    expect(Object.keys(pool.snapshot(0))).toEqual(['a', 'b', 'sky']);
  });
});
