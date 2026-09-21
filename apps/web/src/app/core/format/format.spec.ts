import { describe, expect, it } from 'vitest';
import { formatAltitude, formatSpeed } from './format';

describe('format', () => {
  it('formats altitudes', () => {
    expect(formatAltitude(36000, false)).toBe('FL360');
    expect(formatAltitude(null, false)).toBe('—');
    expect(formatAltitude(1200, true)).toBe('ground');
    expect(formatSpeed(448.2)).toBe('448 kt');
  });
});
