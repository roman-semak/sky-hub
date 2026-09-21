import { describe, expect, it } from 'vitest';
import { activeCriteria, isFilterSpec, loadPresets, savePresets } from './filter-presets';

function memoryStorage(
  initial: string | null = null,
): Pick<Storage, 'getItem' | 'setItem'> & { value: string | null } {
  return {
    value: initial,
    getItem() {
      return this.value;
    },
    setItem(_k: string, v: string) {
      this.value = v;
    },
  };
}

describe('filter presets', () => {
  it('round-trips through storage', () => {
    const s = memoryStorage();
    savePresets([{ name: 'Heavies', filter: { types: ['B744', 'A388'] } }], s);
    expect(loadPresets(s)).toEqual([{ name: 'Heavies', filter: { types: ['B744', 'A388'] } }]);
  });

  it('ignores corrupt or invalid data', () => {
    expect(loadPresets(memoryStorage('{nope'))).toEqual([]);
    expect(loadPresets(memoryStorage(JSON.stringify([{ name: '', filter: {} }])))).toEqual([]);
    expect(loadPresets(memoryStorage(null))).toEqual([]);
  });

  it('validates stored filter specs like the server schema', () => {
    expect(isFilterSpec({})).toBe(true);
    expect(isFilterSpec({ altitude: [0, 1], operators: ['TAP'], militaryOnly: true })).toBe(true);
    expect(isFilterSpec({ altitude: [5, 1] })).toBe(false);
    expect(isFilterSpec({ speed: [0] })).toBe(false);
    expect(isFilterSpec({ types: ['TOOLONG'] })).toBe(false);
    expect(isFilterSpec({ laddOnly: 'yes' })).toBe(false);
    expect(isFilterSpec({ hack: 1 })).toBe(false);
    expect(isFilterSpec([])).toBe(false);
    expect(isFilterSpec(null)).toBe(false);
  });

  it('survives a throwing storage', () => {
    expect(() => {
      savePresets([], {
        setItem: () => {
          throw new Error('quota');
        },
      });
    }).not.toThrow();
  });

  it('counts active criteria', () => {
    expect(activeCriteria({})).toBe(0);
    expect(
      activeCriteria({
        altitude: [0, 1],
        speed: [0, 1],
        types: ['A'],
        operators: ['TAP'],
        countries: ['PT'],
        militaryOnly: true,
        emergencyOnly: true,
        laddOnly: true,
      }),
    ).toBe(8);
    expect(activeCriteria({ types: [], militaryOnly: false })).toBe(0);
  });
});
