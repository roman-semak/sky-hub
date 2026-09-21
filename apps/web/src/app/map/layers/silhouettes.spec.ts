import { describe, expect, it } from 'vitest';
import { SILHOUETTE_IDS, SILHOUETTE_PATHS, SILHOUETTE_SCALE, silhouetteFor } from './silhouettes';

describe('silhouettes', () => {
  it('provides at least the 12 shapes the SPEC asks for', () => {
    expect(SILHOUETTE_IDS.length).toBeGreaterThanOrEqual(12);
    for (const id of SILHOUETTE_IDS) {
      expect(SILHOUETTE_PATHS[id]).toMatch(/^M/);
      expect(SILHOUETTE_SCALE[id]).toBeGreaterThan(0);
    }
  });

  it('maps emitter categories', () => {
    expect(silhouetteFor('A5', false)).toBe('heavy');
    expect(silhouetteFor('A3', false)).toBe('jet');
    expect(silhouetteFor('A7', false)).toBe('helicopter');
    expect(silhouetteFor('B2', false)).toBe('balloon');
    expect(silhouetteFor('B6', false)).toBe('drone');
    expect(silhouetteFor('C1', false)).toBe('vehicle');
    expect(silhouetteFor('C4', false)).toBe('obstacle');
  });

  it('falls back by military flag', () => {
    expect(silhouetteFor(null, false)).toBe('generic');
    expect(silhouetteFor(null, true)).toBe('military');
    expect(silhouetteFor('ZZ', false)).toBe('generic');
  });
});
