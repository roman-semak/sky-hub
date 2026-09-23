import { describe, expect, it } from 'vitest';
import { ClientSession } from '../src/stream/client-session.js';
import { World } from './world.js';

/**
 * CLAUDE.md budget: ≤ 20 KB/s per client with 600 aircraft in view,
 * worst case where every aircraft changes every second.
 */
describe('traffic budget', () => {
  it('stays under 20 KB/s for 600 aircraft at 1 Hz', () => {
    const w = new World().put(...World.grid(600));
    const s = new ClientSession();
    s.subscribe({ bbox: [-11, 37, -8, 40], zoom: 9 });
    let bytes = 0;
    const seconds = 30;
    for (let t = 0; t < seconds; t++) {
      w.now += 1000;
      w.put(...World.grid(600, w.now));
      const p = s.buildFrames(w.rebuild());
      p.commit();
      if (t > 0) bytes += p.frames.reduce((a, f) => a + f.byteLength, 0);
    }
    const perSec = bytes / (seconds - 1);
    expect(perSec).toBeLessThan(20 * 1024);
    expect(perSec).toBeCloseTo(7 + 600 * 28, -1);
  });
});
