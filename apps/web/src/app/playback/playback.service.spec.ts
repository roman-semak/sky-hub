import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { encodeAircraftFrame, FrameType } from '@skytrace/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FETCH_FN } from '../core/live/aircraft-meta.service';
import { PlaybackService } from './playback.service';

const T0 = 1_790_000_000_000;

function body(): ArrayBuffer {
  const frames = [0, 60_000].map(
    (dt) =>
      new Uint8Array(
        encodeAircraftFrame(FrameType.Delta, (T0 + dt) / 1000, [
          {
            icao: 1,
            nonIcao: false,
            lat: 38 + dt / 1e6,
            lon: -9,
            alt: 30000,
            gs: 400,
            track: 0,
            baroRate: 0,
            squawk: null,
            onGround: false,
            mlat: false,
            tisb: false,
            military: false,
            special: false,
            emergency: 'none',
            category: null,
            age: 0,
          },
        ]),
      ),
  );
  const out = new Uint8Array(frames.reduce((n, f) => n + 4 + f.byteLength, 0));
  let o = 0;
  for (const f of frames) {
    new DataView(out.buffer).setUint32(o, f.byteLength);
    out.set(f, o + 4);
    o += 4 + f.byteLength;
  }
  return out.buffer;
}

function setup(fetchFn: typeof fetch): PlaybackService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: FETCH_FN, useValue: fetchFn }],
  });
  return TestBed.inject(PlaybackService);
}

describe('PlaybackService', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('ignores a window that arrives after the user went back to live', async () => {
    const pending: { release: ((r: Response) => void) | null } = { release: null };
    const fetchFn = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        pending.release = resolve;
      }),
    );
    const pb = setup(fetchFn);

    const open = pb.open([-10, 37, -8, 40], T0 + 3_600_000);
    pb.close();
    pending.release?.(new Response(body()));
    await open;

    expect(pb.state()).toBe('off');
    expect(pb.active()).toBe(false);
    expect(pb.registry.aircraft.size).toBe(0);
  });

  it('drops the previous window when a reload fails', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(body()))
      .mockResolvedValue(new Response('nope', { status: 500 }));
    const pb = setup(fetchFn);

    await pb.open([-10, 37, -8, 40], T0 + 3_600_000);
    expect(pb.registry.aircraft.size).toBe(1);

    await pb.open([-10, 37, -8, 40], T0 + 3_600_000);
    expect(pb.state()).toBe('error');
    // The map must not keep drawing the window the bar says is unavailable.
    expect(pb.registry.aircraft.size).toBe(0);
    expect(pb.aircraft()).toBe(0);
  });

  it('loads a window and replays it on a virtual clock', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(body()));
    const pb = setup(fetchFn);
    await pb.open([-10, 37, -8, 40], T0 + 3_600_000);
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain('/api/history?bbox=-10.0000%2C37.0000');
    expect(pb.state()).toBe('ready');
    expect([pb.start(), pb.end(), pb.aircraft()]).toEqual([T0, T0 + 60_000, 1]);
    expect(pb.registry.aircraft.size).toBe(1);

    vi.useFakeTimers({ toFake: ['performance'] });
    pb.setSpeed(60);
    pb.play();
    expect(pb.playing()).toBe(true);
    vi.advanceTimersByTime(500);
    // 0.5 s real × 60 = 30 s virtual.
    expect(pb.clock()).toBeCloseTo(T0 + 30_000, -2);
    vi.advanceTimersByTime(2000);
    pb.step();
    expect(pb.playing()).toBe(false);
    expect(pb.clock()).toBe(T0 + 60_000);
    expect(pb.registry.aircraft.get('000001')?.fixTime).toBe(T0 + 60_000);

    pb.pause();
    pb.seek(T0 - 10_000);
    expect(pb.time()).toBe(T0);
    pb.play();
    pb.close();
    expect(pb.active()).toBe(false);
    expect(pb.registry.aircraft.size).toBe(0);
  });

  it('reports errors and handles empty windows', async () => {
    const failing = setup(vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await failing.open([-10, 37, -8, 40], T0);
    expect(failing.state()).toBe('error');
    failing.play();
    expect(failing.playing()).toBe(false);
    TestBed.resetTestingModule();

    const empty = setup(vi.fn().mockResolvedValue(new Response(new ArrayBuffer(0))));
    await empty.open([-10, 37, -8, 40], T0, 600_000);
    expect([empty.state(), empty.start(), empty.end()]).toEqual(['ready', T0 - 600_000, T0]);
    empty.close();
  });
});
