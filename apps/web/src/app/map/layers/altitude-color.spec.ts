import { describe, expect, it } from 'vitest';
import {
  ALT_EMERGENCY,
  ALT_SELECTED,
  ALT_UNKNOWN,
  ALTITUDE_STOPS,
  altitudeColor,
  altitudeColorGlsl,
  ALT_MILITARY,
  EMERGENCY_RGB,
  MILITARY_RGB,
  SELECTED_RGB,
  UNKNOWN_RGB,
} from './altitude-color';

describe('altitudeColor', () => {
  it('hits every stop exactly', () => {
    for (const [ft, r, g, b] of ALTITUDE_STOPS) {
      expect(altitudeColor(ft)).toEqual([r, g, b]);
    }
  });

  it('interpolates between stops', () => {
    const mid = altitudeColor(1000);
    const [lo, hi] = [ALTITUDE_STOPS[0], ALTITUDE_STOPS[1]];
    expect(mid[0]).toBeCloseTo(((lo?.[1] ?? 0) + (hi?.[1] ?? 0)) / 2, 5);
  });

  it('clamps outside the ramp', () => {
    expect(altitudeColor(-5000)).toEqual(altitudeColor(0));
    expect(altitudeColor(60_000)).toEqual(altitudeColor(40_000));
  });

  it('uses sentinels for special states', () => {
    expect(altitudeColor(ALT_MILITARY)).toEqual([...MILITARY_RGB]);
    expect(altitudeColor(ALT_EMERGENCY)).toEqual([...EMERGENCY_RGB]);
    expect(altitudeColor(ALT_SELECTED)).toEqual([...SELECTED_RGB]);
    expect(altitudeColor(ALT_UNKNOWN)).toEqual([...UNKNOWN_RGB]);
  });
});

describe('altitudeColorGlsl', () => {
  const glsl = altitudeColorGlsl();

  it('declares the function and one branch per stop', () => {
    expect(glsl).toContain('vec3 altitudeColor(float altFt)');
    expect(glsl.split('mix(').length - 1).toBe(ALTITUDE_STOPS.length - 1);
    expect(glsl).toContain(`altFt == ${ALT_EMERGENCY}.0`);
  });

  it('agrees with the CPU ramp when evaluated', () => {
    // Minimal evaluator for the generated GLSL: the branches are all of the
    // form `if (altFt <= X) return mix(A, B, (altFt - lo) / span);`.
    const evaluate = (alt: number): number[] => {
      for (const line of glsl.split('\n')) {
        const eq = /altFt == (-?\d+(?:\.\d+)?) *\) return vec3\(([^)]*)\)/.exec(line);
        if (eq !== null && alt === Number(eq[1]))
          return (eq[2] ?? '').split(',').map((v) => Number(v) * 255);
        const le = /altFt <= (-?\d+(?:\.\d+)?)\) return vec3\(([^)]*)\)/.exec(line);
        if (le !== null && alt <= Number(le[1]))
          return (le[2] ?? '').split(',').map((v) => Number(v) * 255);
        const mix =
          /altFt <= (-?\d+(?:\.\d+)?)\) return mix\(vec3\(([^)]*)\), vec3\(([^)]*)\), \(altFt - (-?\d+(?:\.\d+)?)\) \/ (-?\d+(?:\.\d+)?)\)/.exec(
            line,
          );
        if (mix !== null && alt <= Number(mix[1])) {
          const a = (mix[2] ?? '').split(',').map(Number);
          const b = (mix[3] ?? '').split(',').map(Number);
          const t = (alt - Number(mix[4])) / Number(mix[5]);
          return a.map((v, i) => (v + ((b[i] ?? 0) - v) * t) * 255);
        }
      }
      return [];
    };
    for (const alt of [
      ALT_EMERGENCY,
      ALT_SELECTED,
      ALT_MILITARY,
      ALT_UNKNOWN,
      0,
      1500,
      8000,
      25_000,
      39_000,
    ]) {
      const gpu = evaluate(alt);
      const cpu = altitudeColor(alt);
      expect(gpu.length).toBe(3);
      gpu.forEach((v, i) => {
        expect(v).toBeCloseTo(cpu[i] ?? 0, 1);
      });
    }
  });
});
