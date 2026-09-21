import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyFix,
  deadReckonInto,
  DEFAULT_DR_OPTIONS,
  renderPoseInto,
  createTrackState,
  deadReckon,
  easeOutCubic,
  haversineDistance,
  KNOTS_TO_MPS,
  renderPose,
  stalenessOpacity,
  type Fix,
} from '../src/index.js';
import { bearing, lat, lon } from './arbitraries.js';

const T0 = 1_700_000_000_000;

describe('easeOutCubic', () => {
  it('is clamped and monotonic', () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe('deadReckon', () => {
  it('moves gs × dt along the track', () => {
    fc.assert(
      fc.property(
        lat,
        lon,
        bearing,
        fc.double({ min: 1, max: 600, noNaN: true }),
        fc.double({ min: 0.1, max: 30, noNaN: true }),
        (φ, λ, θ, gs, dt) => {
          const fix: Fix = { lat: φ, lon: λ, track: θ, gs, t: T0 };
          const p = deadReckon(fix, T0 + dt * 1000);
          expect(haversineDistance(φ, λ, p.lat, p.lon)).toBeCloseTo(gs * KNOTS_TO_MPS * dt, 0);
        },
      ),
    );
  });

  it('does not move without kinematics or into the past', () => {
    const base = { lat: 10, lon: 20, t: T0 };
    expect(deadReckon({ ...base, track: null, gs: 400 }, T0 + 5000)).toEqual({ lat: 10, lon: 20 });
    expect(deadReckon({ ...base, track: 90, gs: null }, T0 + 5000)).toEqual({ lat: 10, lon: 20 });
    expect(deadReckon({ ...base, track: 90, gs: 0 }, T0 + 5000)).toEqual({ lat: 10, lon: 20 });
    expect(deadReckon({ ...base, track: 90, gs: 400 }, T0 - 5000)).toEqual({ lat: 10, lon: 20 });
  });

  it('caps extrapolation', () => {
    const fix: Fix = { lat: 0, lon: 0, track: 90, gs: 360, t: T0 };
    const capped = deadReckon(fix, T0 + 3_600_000, 60);
    expect(haversineDistance(0, 0, capped.lat, capped.lon)).toBeCloseTo(360 * KNOTS_TO_MPS * 60, 0);
  });
});

describe('track smoothing', () => {
  const fix: Fix = { lat: 38.7, lon: -9.1, track: 90, gs: 300, t: T0 };

  it('renders the extrapolated fix when not blending', () => {
    const s = createTrackState(fix);
    const pose = renderPose(s, T0 + 1000);
    expect(pose).toMatchObject(deadReckon(fix, T0 + 1000));
    expect(pose.heading).toBe(90);
  });

  it('blends towards a new fix instead of teleporting', () => {
    const s0 = createTrackState(fix);
    const now = T0 + 2000;
    const next: Fix = { lat: 38.7005, lon: -9.08, track: 100, gs: 300, t: now };
    const s1 = applyFix(s0, next, now);
    expect(s1.previous).not.toBeNull();
    const start = renderPose(s1, now);
    const before = renderPose(s0, now);
    expect(haversineDistance(start.lat, start.lon, before.lat, before.lon)).toBeLessThan(1);
    const mid = renderPose(s1, now + 250);
    expect(mid.heading).toBeGreaterThan(90);
    expect(mid.heading).toBeLessThan(100);
    const end = renderPose(s1, now + 600);
    const target = deadReckon(next, now + 600);
    expect(end.lat).toBeCloseTo(target.lat, 9);
    expect(end.heading).toBe(100);
  });

  it('teleports when the prediction is off by more than 5 km', () => {
    const s0 = createTrackState(fix);
    const far: Fix = { lat: 39.5, lon: -9.1, track: 90, gs: 300, t: T0 + 1000 };
    const s1 = applyFix(s0, far, T0 + 1000);
    expect(s1.previous).toBeNull();
    expect(renderPose(s1, T0 + 1000).lat).toBeCloseTo(39.5);
  });

  it('ignores out-of-order fixes', () => {
    const s0 = createTrackState(fix);
    expect(applyFix(s0, { ...fix, t: T0 - 1 }, T0)).toBe(s0);
  });

  it('keeps the track null-safe', () => {
    const s0 = createTrackState({ ...fix, track: null });
    const s1 = applyFix(s0, { ...fix, track: null, t: T0 + 1000 }, T0 + 1000);
    expect(renderPose(s1, T0 + 1100).heading).toBe(0);
  });

  it('rendered position never jumps more than the teleport threshold', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.double({ min: -0.01, max: 0.01, noNaN: true }), bearing), {
          minLength: 1,
          maxLength: 10,
        }),
        (updates) => {
          let s = createTrackState(fix);
          let t = T0;
          for (const [dLat, trk] of updates) {
            const prev = renderPose(s, t + 1000);
            t += 1000;
            const cur = renderPose(s, t);
            s = applyFix(s, { lat: cur.lat + dLat, lon: cur.lon, track: trk, gs: 300, t }, t);
            const after = renderPose(s, t);
            expect(haversineDistance(prev.lat, prev.lon, after.lat, after.lon)).toBeLessThan(1);
          }
        },
      ),
    );
  });
});

describe('allocation-free variants', () => {
  it('match the allocating functions exactly', () => {
    fc.assert(
      fc.property(
        lat,
        lon,
        bearing,
        fc.double({ min: 0, max: 600, noNaN: true }),
        fc.option(bearing, { nil: null }),
        fc.integer({ min: 0, max: 3000 }),
        (φ, λ, θ, gs, newTrack, dt) => {
          const s0 = createTrackState({ lat: φ, lon: λ, track: θ, gs, t: T0 });
          const s1 = applyFix(s0, { lat: φ, lon: λ, track: newTrack, gs, t: T0 + 1000 }, T0 + 1000);
          for (const s of [s0, s1]) {
            const out = { lat: 0, lon: 0, heading: 0 };
            renderPoseInto(s, T0 + 1000 + dt, DEFAULT_DR_OPTIONS, out);
            const ref = renderPose(s, T0 + 1000 + dt);
            expect(out.lat).toBeCloseTo(ref.lat, 9);
            expect(out.lon).toBeCloseTo(ref.lon, 9);
            expect(out.heading).toBeCloseTo(ref.heading, 9);
          }
          const fix: Fix = { lat: φ, lon: λ, track: θ, gs, t: T0 };
          const o = { lat: 0, lon: 0, heading: 0 };
          deadReckonInto(fix, T0 + dt * 10, 60, o);
          const r = deadReckon(fix, T0 + dt * 10, 60);
          expect(o.lat).toBeCloseTo(r.lat, 9);
          expect(o.lon).toBeCloseTo(r.lon, 9);
        },
      ),
    );
  });
});

describe('stalenessOpacity', () => {
  it('fades between 30 and 120 s and removes afterwards', () => {
    expect(stalenessOpacity(0)).toBe(1);
    expect(stalenessOpacity(30)).toBe(1);
    expect(stalenessOpacity(75)).toBeCloseTo(0.7);
    expect(stalenessOpacity(120)).toBeCloseTo(0.4);
    expect(stalenessOpacity(121)).toBe(0);
  });
});
