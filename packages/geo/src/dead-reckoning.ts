import { lerpAngle, normalizeLon, shortestAngleDelta } from './angles.js';
import { EARTH_RADIUS_M, KNOTS_TO_MPS } from './constants.js';
import { destinationPoint, type LatLon } from './destination-point.js';
import { easeOutCubic } from './easing.js';
import { haversineDistance } from './haversine-distance.js';

const DEG = Math.PI / 180;

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

/** Mutable pose for the allocation-free render path. */
export interface MutablePose {
  lat: number;
  lon: number;
  heading: number;
}

/**
 * Allocation-free {@link deadReckon}: writes the extrapolated position into
 * `out` (same great-circle formula as {@link destinationPoint}). Used by the
 * 60 fps render loop where thousands of calls per frame must not allocate.
 */
export function deadReckonInto(
  fix: Fix,
  nowMs: number,
  maxExtrapolationSec: number,
  out: MutablePose,
): void {
  const { track, gs } = fix;
  const dtSec = Math.min(maxExtrapolationSec, Math.max(0, (nowMs - fix.t) / 1000));
  if (track === null || gs === null || gs <= 0 || dtSec === 0) {
    out.lat = fix.lat;
    out.lon = fix.lon;
    return;
  }
  const δ = (gs * KNOTS_TO_MPS * dtSec) / EARTH_RADIUS_M;
  const θ = track * DEG;
  const φ1 = fix.lat * DEG;
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const sinφ2 = Math.min(1, Math.max(-1, sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ)));
  const Δλ = Math.atan2(Math.sin(θ) * sinδ * cosφ1, cosδ - sinφ1 * sinφ2);
  out.lat = Math.asin(sinφ2) / DEG;
  out.lon = normalizeLon(fix.lon + Δλ / DEG);
}

const scratch: MutablePose = { lat: 0, lon: 0, heading: 0 };

/**
 * Allocation-free {@link renderPose}: writes where to draw the aircraft into
 * `out`. The render loop calls this for every aircraft on every frame.
 */
export function renderPoseInto(
  state: TrackState,
  nowMs: number,
  opts: DeadReckoningOptions,
  out: MutablePose,
): void {
  const cur = state.current;
  deadReckonInto(cur, nowMs, opts.maxExtrapolationSec, out);
  const prev = state.previous;
  const targetHeading = cur.track ?? prev?.track ?? 0;
  const k = prev === null ? 1 : easeOutCubic((nowMs - state.blendStart) / opts.blendMs);
  if (prev === null || k >= 1) {
    out.heading = targetHeading;
    return;
  }
  deadReckonInto(prev, nowMs, opts.maxExtrapolationSec, scratch);
  out.lat = scratch.lat + (out.lat - scratch.lat) * k;
  out.lon = normalizeLon(scratch.lon + shortestAngleDelta(scratch.lon, out.lon) * k);
  out.heading = lerpAngle(prev.track ?? targetHeading, targetHeading, k);
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
