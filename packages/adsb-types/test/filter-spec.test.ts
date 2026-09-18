import { describe, expect, it } from 'vitest';
import { FilterSpecSchema } from '../src/index.js';

describe('FilterSpecSchema', () => {
  it('accepts an empty filter', () => {
    expect(FilterSpecSchema.safeParse({}).success).toBe(true);
  });
  it('accepts a full filter', () => {
    const r = FilterSpecSchema.safeParse({
      altitude: [8000, 41000],
      speed: [0, 600],
      types: ['A20N'],
      operators: ['TAP'],
      countries: ['PT'],
      militaryOnly: false,
      emergencyOnly: true,
      laddOnly: false,
    });
    expect(r.success).toBe(true);
  });
  it('rejects inverted ranges and unknown keys', () => {
    expect(FilterSpecSchema.safeParse({ altitude: [10, 5] }).success).toBe(false);
    expect(FilterSpecSchema.safeParse({ hack: 1 }).success).toBe(false);
  });
});
