import { describe, expect, it } from 'vitest';
import { heatRadiusPixels } from './heat-radius';

describe('heatRadiusPixels', () => {
  it('covers several cells so binned data reads as a field', () => {
    // At zoom 7 a 0.25° cell is ~23 px across; the kernel must be wider.
    const cellPx = (0.25 * 256 * 2 ** 7) / 360;
    expect(heatRadiusPixels(0.25, 7)).toBeCloseTo(cellPx * 3, 5);
    expect(heatRadiusPixels(0.25, 7)).toBeGreaterThan(cellPx);
  });

  it('stays readable when cells are tiny or huge on screen', () => {
    expect(heatRadiusPixels(0.25, 2)).toBe(30);
    expect(heatRadiusPixels(0.25, 12)).toBe(140);
  });

  it('grows with the grid step at a fixed zoom', () => {
    expect(heatRadiusPixels(0.5, 6)).toBeGreaterThan(heatRadiusPixels(0.25, 6));
  });
});
