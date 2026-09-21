import { describe, expect, it } from 'vitest';
import {
  ALT_RANGE,
  draftFromSpec,
  flightLevel,
  normalizeCode,
  SPEED_RANGE,
  specFromDraft,
} from './filter-draft';

describe('filter draft', () => {
  it('maps an empty filter to full ranges and back to empty', () => {
    const d = draftFromSpec({});
    expect(d.altitude).toEqual([...ALT_RANGE]);
    expect(d.speed).toEqual([...SPEED_RANGE]);
    expect(specFromDraft(d)).toEqual({});
  });

  it('keeps narrowed ranges and open-ends the top of the slider', () => {
    const d = draftFromSpec({});
    d.altitude = [20_000, ALT_RANGE[1]];
    d.speed = [100, 300];
    expect(specFromDraft(d)).toEqual({ altitude: [20_000, 60_000], speed: [100, 300] });
    d.speed = [0, SPEED_RANGE[1]];
    d.altitude = [0, 10_000];
    expect(specFromDraft(d)).toEqual({ altitude: [0, 10_000] });
  });

  it('round-trips lists and flags', () => {
    const spec = {
      operators: ['TAP'],
      types: ['A20N'],
      countries: ['PT'],
      militaryOnly: true,
      emergencyOnly: true,
      laddOnly: true,
    };
    expect(specFromDraft(draftFromSpec(spec))).toEqual(spec);
    expect(draftFromSpec({ altitude: [1000, 2000], speed: [50, 60] })).toMatchObject({
      altitude: [1000, 2000],
      speed: [50, 60],
    });
  });

  it('formats flight levels and normalizes codes', () => {
    expect(flightLevel(8000)).toBe('FL080');
    expect(flightLevel(45_000)).toBe('FL450+');
    expect(normalizeCode(' tap ', 3)).toBe('TAP');
    expect(normalizeCode('TOOLONG', 3)).toBeNull();
    expect(normalizeCode('A', 3)).toBeNull();
    expect(normalizeCode('T-P', 3)).toBeNull();
  });
});
