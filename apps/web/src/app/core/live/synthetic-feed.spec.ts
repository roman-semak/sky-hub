import { FrameType } from '@skytrace/protocol';
import { describe, expect, it } from 'vitest';
import { SyntheticFeed } from './synthetic-feed';

describe('SyntheticFeed', () => {
  it('starts with a snapshot and then deltas', () => {
    const feed = new SyntheticFeed(10, 50, 10);
    const first = feed.tick(1_700_000_000_000, 1);
    expect(first.type).toBe(FrameType.Snapshot);
    expect(first.type === FrameType.Snapshot && first.records).toHaveLength(10);
    expect(feed.tick(1_700_000_001_000, 1).type).toBe(FrameType.Delta);
  });

  it('moves aircraft and is deterministic for a seed', () => {
    const a = new SyntheticFeed(5, 50, 10, 6, 42);
    const b = new SyntheticFeed(5, 50, 10, 6, 42);
    a.tick(0, 1);
    b.tick(0, 1);
    const fa = a.tick(1000, 1);
    const fb = b.tick(1000, 1);
    expect(fa).toEqual(fb);
    const first = fa.type === FrameType.Delta ? fa.records[0] : undefined;
    expect(first?.lat).not.toBe(50);
  });
});
