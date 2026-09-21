import { computed, inject, Injectable, signal } from '@angular/core';
import type { BBox } from '@skytrace/geo';
import { FETCH_FN } from '../core/live/aircraft-meta.service';
import { LiveRegistry } from '../core/live/live-registry';
import { parsePlaybackPayload, PlaybackTimeline } from './playback-timeline';

export type PlaybackSpeed = 1 | 10 | 60;
export type PlaybackState = 'off' | 'loading' | 'ready' | 'error';

const HOUR_MS = 3_600_000;
/** Server thins history to one fix per aircraft per 20 s; dead reckoning fills the gaps. */
const SPACING_MS = 20_000;

/**
 * History playback (SPEC § 5.3 screen 6): loads a window of recorded fixes
 * for the viewport and replays them on a virtual clock at ×1/×10/×60.
 * The map renders `registry` with `clock()` instead of live data while on.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackService {
  private readonly fetchFn = inject(FETCH_FN);
  readonly registry = new LiveRegistry();
  readonly state = signal<PlaybackState>('off');
  readonly playing = signal(false);
  readonly speed = signal<PlaybackSpeed>(10);
  readonly start = signal(0);
  readonly end = signal(0);
  /** Virtual time, refreshed ~4×/s for the UI (the map reads `clock()` every frame). */
  readonly time = signal(0);
  readonly aircraft = signal(0);
  readonly active = computed(() => this.state() !== 'off');

  private timeline: PlaybackTimeline | null = null;
  private virtualAt = 0;
  private realAt = 0;
  private uiTimer: ReturnType<typeof setInterval> | null = null;

  /** Virtual "now" for the render loop. */
  clock(): number {
    if (!this.playing()) return this.virtualAt;
    const t = this.virtualAt + (performance.now() - this.realAt) * this.speed();
    return Math.min(t, this.end());
  }

  async open(bbox: BBox, to = Date.now(), windowMs = HOUR_MS): Promise<void> {
    this.state.set('loading');
    this.playing.set(false);
    const from = to - windowMs;
    const params = new URLSearchParams({
      bbox: bbox.map((v) => v.toFixed(4)).join(','),
      from: String(Math.round(from)),
      to: String(Math.round(to)),
      spacing: String(SPACING_MS),
    });
    try {
      const res = await this.fetchFn(`/api/history?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const timeline = new PlaybackTimeline(parsePlaybackPayload(await res.arrayBuffer()));
      this.timeline = timeline;
      this.start.set(timeline.fixCount === 0 ? from : timeline.start);
      this.end.set(timeline.fixCount === 0 ? to : timeline.end);
      this.aircraft.set(timeline.aircraftCount);
      this.seek(this.start());
      this.state.set('ready');
      this.startUiTimer();
    } catch {
      this.state.set('error');
    }
  }

  close(): void {
    this.playing.set(false);
    this.timeline = null;
    this.registry.clear();
    this.state.set('off');
    if (this.uiTimer !== null) clearInterval(this.uiTimer);
    this.uiTimer = null;
  }

  play(): void {
    if (this.timeline === null) return;
    if (this.virtualAt >= this.end()) this.seek(this.start());
    this.realAt = performance.now();
    this.playing.set(true);
  }

  pause(): void {
    this.virtualAt = this.clock();
    this.playing.set(false);
  }

  setSpeed(s: PlaybackSpeed): void {
    this.virtualAt = this.clock();
    this.realAt = performance.now();
    this.speed.set(s);
  }

  seek(t: number): void {
    const clamped = Math.min(this.end(), Math.max(this.start(), t));
    this.virtualAt = clamped;
    this.realAt = performance.now();
    this.timeline?.seek(this.registry, clamped);
    this.time.set(clamped);
  }

  /** Called by the render loop each frame: applies fixes up to the virtual now. */
  step(): void {
    const tl = this.timeline;
    if (tl === null) return;
    const t = this.clock();
    tl.advanceTo(this.registry, t);
    if (this.playing() && t >= this.end()) {
      this.virtualAt = this.end();
      this.playing.set(false);
    }
  }

  private startUiTimer(): void {
    if (this.uiTimer !== null) clearInterval(this.uiTimer);
    this.uiTimer = setInterval(() => {
      this.time.set(this.clock());
    }, 250);
  }
}
