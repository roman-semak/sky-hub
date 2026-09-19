import { lerpAngle, normalizeLon, shortestAngleDelta } from './angles.js';
import { KNOTS_TO_MPS } from './constants.js';
import { destinationPoint, type LatLon } from './destination-point.js';
import { easeOutCubic } from './easing.js';
import { haversineDistance } from './haversine-distance.js';

/** A reported position with its kinematics. */
export interface Fix {
  readonly lat: number;
  readonly lon: number;
  /** Track over ground, degrees; `null` when unknown (no extrapolation). */
  readonly track: number | null;
  /** Ground speed, knots; `null` when unknown (no extrapolation). */
  readonly gs: number | null;
  /** Unix ms of the fix. */
  readonly t: number;
}

/** Smoothing state of one aircraft between two fixes. */
export interface TrackState {
  readonly current: Fix;
  /** Fix we are blending away from; `null` when not blending. */
  readonly previous: Fix | null;
  /** Unix ms when the blend towards {@link current} started. */
  readonly blendStart: number;
}

export interface Pose extends LatLon {
  /** Heading for the icon, degrees `[0, 360)`. */
  readonly heading: number;
}

export interface DeadReckoningOptions {
  /** Duration of the render → target blend, ms. SPEC § 5.1: ~500 ms. */
  readonly blendMs: number;
  /** Prediction mismatch above which we teleport instead of blending, metres. */
  readonly teleportM: number;
  /** Extrapolation is capped so a silent aircraft does not fly away forever, seconds. */
  readonly maxExtrapolationSec: number;
}

export const DEFAULT_DR_OPTIONS: DeadReckoningOptions = {
  blendMs: 500,
  teleportM: 5000,
  maxExtrapolationSec: 60,
};

/**
 * Constant-velocity great-circle extrapolation of a fix to `nowMs`:
 * d = gs ⋅ (now − t), moved along `track` with {@link destinationPoint}.
 */
export function deadReckon(
  fix: Fix,
  nowMs: number,
  maxExtrapolationSec: number = DEFAULT_DR_OPTIONS.maxExtrapolationSec,
): LatLon {
  if (fix.track === null || fix.gs === null || fix.gs <= 0) return { lat: fix.lat, lon: fix.lon };
  const dtSec = Math.min(maxExtrapolationSec, Math.max(0, (nowMs - fix.t) / 1000));
  if (dtSec === 0) return { lat: fix.lat, lon: fix.lon };
  return destinationPoint(fix.lat, fix.lon, fix.track, fix.gs * KNOTS_TO_MPS * dtSec);
}

export function createTrackState(fix: Fix): TrackState {
  return { current: fix, previous: null, blendStart: fix.t };
}

/**
 * Integrates a new fix. Instead of teleporting to it, the renderer blends from
 * the old prediction to the new one — unless they disagree by more than
 * `teleportM` (glitch or long gap), in which case we jump immediately.
 */
export function applyFix(
  state: TrackState,
  fix: Fix,
  nowMs: number,
  opts: DeadReckoningOptions = DEFAULT_DR_OPTIONS,
): TrackState {
  if (fix.t < state.current.t) return state;
  const rendered = renderPose(state, nowMs, opts);
  const predicted = deadReckon(fix, nowMs, opts.maxExtrapolationSec);
  const gap = haversineDistance(rendered.lat, rendered.lon, predicted.lat, predicted.lon);
  if (gap > opts.teleportM) return createTrackState(fix);
  // Freeze the current rendered pose as a synthetic fix so a blend that is
  // interrupted by the next fix continues smoothly.
  const from: Fix = {
    lat: rendered.lat,
    lon: rendered.lon,
    track: state.current.track === null ? null : rendered.heading,
    gs: state.current.gs,
    t: nowMs,
  };
  return { current: fix, previous: from, blendStart: nowMs };
}

function lerpLatLon(a: LatLon, b: LatLon, k: number): LatLon {
  return {
    lat: a.lat + (b.lat - a.lat) * k,
    lon: a.lon + shortestAngleDelta(a.lon, b.lon) * k,
  };
}

/** Where to draw the aircraft at `nowMs`. */
export function renderPose(
  state: TrackState,
  nowMs: number,
  opts: DeadReckoningOptions = DEFAULT_DR_OPTIONS,
): Pose {
  const target = deadReckon(state.current, nowMs, opts.maxExtrapolationSec);
  const targetHeading = state.current.track ?? state.previous?.track ?? 0;
  const prev = state.previous;
  if (prev === null) return { ...target, heading: targetHeading };
  const k = easeOutCubic((nowMs - state.blendStart) / opts.blendMs);
  if (k >= 1) return { ...target, heading: targetHeading };
  const origin = deadReckon(prev, nowMs, opts.maxExtrapolationSec);
  const pos = lerpLatLon(origin, target, k);
  const prevHeading = prev.track ?? targetHeading;
  return {
    lat: pos.lat,
    lon: normalizeLon(pos.lon),
    heading: lerpAngle(prevHeading, targetHeading, k),
  };
}

/** Age after which the icon starts to fade, seconds (SPEC § 5.1). */
export const STALE_FADE_START_SEC = 30;
/** Age after which the aircraft is removed, seconds (SPEC § 5.1). */
export const STALE_REMOVE_SEC = 120;
const MIN_STALE_OPACITY = 0.4;

/**
 * Icon opacity for a position that is `ageSec` old: 1 until 30 s, then linear
 * down to 0.4 at 120 s, and 0 (remove) after that.
 */
export function stalenessOpacity(ageSec: number): number {
  if (ageSec <= STALE_FADE_START_SEC) return 1;
  if (ageSec > STALE_REMOVE_SEC) return 0;
  const k = (ageSec - STALE_FADE_START_SEC) / (STALE_REMOVE_SEC - STALE_FADE_START_SEC);
  return 1 - k * (1 - MIN_STALE_OPACITY);
}
