import { describe, expect, it } from 'vitest';
import { backoffDelay, DEFAULT_BACKOFF } from './backoff';

describe('backoffDelay', () => {
  it('doubles up to the cap', () => {
    const mid = (): number => 0.5;
    expect(backoffDelay(0, DEFAULT_BACKOFF, mid)).toBe(500);
    expect(backoffDelay(1, DEFAULT_BACKOFF, mid)).toBe(1000);
    expect(backoffDelay(4, DEFAULT_BACKOFF, mid)).toBe(8000);
    expect(backoffDelay(20, DEFAULT_BACKOFF, mid)).toBe(30_000);
    expect(backoffDelay(-5, DEFAULT_BACKOFF, mid)).toBe(500);
  });

  it('spreads reconnects by ±jitter', () => {
    expect(backoffDelay(1, DEFAULT_BACKOFF, () => 0)).toBe(700);
    expect(backoffDelay(1, DEFAULT_BACKOFF, () => 1)).toBe(1300);
  });
});
