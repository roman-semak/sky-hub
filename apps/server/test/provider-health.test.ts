import { describe, expect, it } from 'vitest';
import { ProviderHealth } from '../src/ingest/provider-health.js';

describe('ProviderHealth', () => {
  it('paces requests and blocks while in flight', () => {
    const h = new ProviderHealth(1000);
    expect(h.isAvailable(0)).toBe(true);
    h.begin(0);
    expect(h.isAvailable(5000)).toBe(false);
    h.succeed(200, 200);
    expect(h.isAvailable(500)).toBe(false);
    expect(h.isAvailable(1000)).toBe(true);
    expect(h.snapshot(1000)).toMatchObject({
      state: 'closed',
      ok: 1,
      requests: 1,
      lastLatencyMs: 200,
    });
  });

  it('backs off multiplicatively on 429 and recovers slowly', () => {
    const h = new ProviderHealth(1000);
    h.begin(0);
    h.fail(0, 'rate-limited', 'HTTP 429');
    expect(h.snapshot(0).intervalMs).toBe(2000);
    expect(h.isAvailable(1999)).toBe(false);
    expect(h.isAvailable(2000)).toBe(true);
    h.begin(2000);
    h.succeed(2100, 100);
    expect(h.snapshot(2100).intervalMs).toBe(1900);
    for (let i = 0; i < 100; i++) {
      h.begin(0);
      h.succeed(0, 1);
    }
    expect(h.snapshot(0).intervalMs).toBe(1000);
  });

  it('opens the breaker after 3 consecutive failures for 60 s', () => {
    const h = new ProviderHealth(10);
    for (let i = 0; i < 3; i++) {
      h.begin(i);
      h.fail(i, 'error', 'HTTP 503');
    }
    expect(h.snapshot(10)).toMatchObject({
      state: 'open',
      openUntil: 60_002,
      errors: 3,
      lastError: 'HTTP 503',
    });
    expect(h.isAvailable(30_000)).toBe(false);
    // Half-open after the window: one failure re-opens immediately.
    expect(h.isAvailable(60_002)).toBe(true);
    h.begin(60_002);
    h.fail(60_003, 'error', 'again');
    expect(h.snapshot(60_004).state).toBe('open');
    expect(h.isAvailable(120_004)).toBe(true);
    h.begin(120_004);
    h.succeed(120_005, 1);
    expect(h.snapshot(120_005)).toMatchObject({ state: 'closed', consecutiveFailures: 0 });
  });

  it('caps the backoff interval', () => {
    const h = new ProviderHealth(40_000, {
      failureThreshold: 100,
      openMs: 1,
      maxIntervalMs: 60_000,
    });
    for (let i = 0; i < 5; i++) {
      h.begin(0);
      h.fail(0, 'rate-limited', '429');
    }
    expect(h.snapshot(0).intervalMs).toBe(60_000);
  });
});
