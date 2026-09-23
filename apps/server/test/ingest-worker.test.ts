import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoverageScheduler } from '../src/ingest/coverage-scheduler.js';
import { IngestWorker } from '../src/ingest/ingest-worker.js';
import type { Provider, ProviderOutcome } from '../src/ingest/provider.js';
import { ProviderPool } from '../src/ingest/provider-pool.js';
import { silentLogger } from '../src/logger.js';
import { StateStore } from '../src/state/state-store.js';
import { makeAircraft, makeCircle, T0 } from './fixtures.js';

function setup(outcome: () => Promise<ProviderOutcome>) {
  let now = T0;
  const provider: Provider = {
    id: 'p',
    minIntervalMs: 1000,
    fallbackOnly: false,
    fetchCircle: outcome,
  };
  const pool = new ProviderPool([provider]);
  const scheduler = new CoverageScheduler([makeCircle('a', 38, -9)]);
  const store = new StateStore();
  const worker = new IngestWorker(
    pool,
    scheduler,
    store,
    silentLogger,
    { tickMs: 10, indexMs: 20, evictAfterMs: 60_000 },
    () => now,
  );
  return { worker, pool, store, scheduler, advance: (ms: number) => (now += ms) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('IngestWorker', () => {
  it('keeps going when the store throws mid-tick', async () => {
    const { worker, store, pool, advance } = setup(async () => ({
      kind: 'ok',
      aircraft: [makeAircraft({ seenTime: T0 })],
      invalid: 0,
    }));
    vi.spyOn(store, 'upsertMany').mockImplementationOnce(() => {
      throw new Error('boom');
    });

    worker.tick();
    // The failure must be booked against the provider, or it stays "in
    // flight" for good; an unhandled rejection would take the process down.
    await vi.waitFor(() => {
      expect(pool.snapshot(T0)['p']?.consecutiveFailures).toBe(1);
    });

    // The circle went back to the queue, so the next tick still works.
    advance(1000);
    worker.tick();
    await vi.waitFor(() => {
      expect(store.size).toBe(1);
    });
  });

  it('fetches, stores and publishes a spatial index', async () => {
    const { worker, store, pool } = setup(async () => ({
      kind: 'ok',
      aircraft: [makeAircraft({ seenTime: T0 })],
      invalid: 2,
    }));
    const seen: number[] = [];
    const off = worker.onIndex((idx) => seen.push(idx.size));
    worker.tick();
    await vi.waitFor(() => {
      expect(store.size).toBe(1);
    });
    worker.rebuildIndex();
    expect(seen).toEqual([1]);
    expect(worker.currentIndex.size).toBe(1);
    expect(worker.statistics).toMatchObject({ fetches: 1, acceptedUpdates: 1, invalidEntries: 2 });
    expect(pool.snapshot(T0)['p']?.ok).toBe(1);
    off();
  });

  it('records failures and thrown errors against the provider', async () => {
    let calls = 0;
    const { worker, pool, advance } = setup(async () => {
      calls++;
      if (calls === 1) return { kind: 'rate-limited', status: 429 };
      if (calls === 2) return { kind: 'error', status: 500, message: 'HTTP 500' };
      throw new Error('boom');
    });
    for (let i = 0; i < 3; i++) {
      worker.tick();
      await vi.waitFor(() => {
        expect(pool.snapshot(T0)['p']?.consecutiveFailures).toBe(i + 1);
      });
      advance(10_000);
    }
    expect(pool.snapshot(T0 + 30_000)['p']).toMatchObject({
      rateLimited: 1,
      errors: 2,
      state: 'open',
    });
  });

  it('evicts stale aircraft on index rebuild', async () => {
    const { worker, store, advance } = setup(async () => ({
      kind: 'ok',
      aircraft: [makeAircraft()],
      invalid: 0,
    }));
    worker.tick();
    await vi.waitFor(() => {
      expect(store.size).toBe(1);
    });
    advance(61_000);
    const removed: string[][] = [];
    worker.onIndex((_i, r) => removed.push([...r]));
    worker.rebuildIndex();
    expect(removed).toEqual([['abcdef']]);
  });

  it('starts and stops timers', async () => {
    vi.useFakeTimers();
    const fetchCircle = vi.fn(async (): Promise<ProviderOutcome> => ({
      kind: 'ok',
      aircraft: [],
      invalid: 0,
    }));
    const { worker } = setup(fetchCircle);
    worker.start();
    worker.start();
    await vi.advanceTimersByTimeAsync(50);
    expect(fetchCircle).toHaveBeenCalledTimes(1);
    await worker.stop();
    await worker.stop();
  });
});
