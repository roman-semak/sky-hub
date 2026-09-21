import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FETCH_FN } from '../core/live/aircraft-meta.service';
import { MapUiStore } from '../core/state/map-ui.store';
import { WeatherLayersService } from './weather-layers.service';

function setup(fetchFn: typeof fetch): WeatherLayersService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: FETCH_FN, useValue: fetchFn }],
  });
  return TestBed.inject(WeatherLayersService);
}

describe('WeatherLayersService', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('builds the latest RainViewer tile template when radar is on', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          host: 'https://tiles.example',
          radar: {
            past: [
              { time: 1, path: '/a' },
              { time: 2, path: '/b' },
            ],
          },
        }),
      ),
    );
    const w = setup(fetchFn);
    w.radarOn.set(true);
    TestBed.tick();
    await vi.waitFor(() => {
      expect(w.radarTiles()).toBe('https://tiles.example/b/256/{z}/{x}/{y}/2/1_1.png');
    });
    expect(w.radarTime()).toBe(2000);
    w.radarOn.set(false);
    TestBed.tick();
    expect(w.radarTiles()).toBeNull();
  });

  it('loads the wind grid for the viewport and level, debounced', async () => {
    vi.useFakeTimers();
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ level: 500, cols: 8, rows: 8, u: [], v: [] })),
      );
    const w = setup(fetchFn);
    TestBed.inject(MapUiStore).bbox.set([-10, 37, -8, 40]);
    w.windLevel.set(500);
    w.windOn.set(true);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(500);
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      '/api/wind?bbox=-10.000%2C37.000%2C-8.000%2C40.000&level=500',
    );
    expect(w.wind()?.level).toBe(500);
    w.windOn.set(false);
    TestBed.tick();
    expect(w.wind()).toBeNull();
  });

  it('fails quietly', async () => {
    vi.useFakeTimers();
    const w = setup(vi.fn().mockRejectedValue(new Error('offline')));
    TestBed.inject(MapUiStore).bbox.set([0, 0, 1, 1]);
    w.radarOn.set(true);
    w.windOn.set(true);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(500);
    expect(w.radarTiles()).toBeNull();
    expect(w.wind()).toBeNull();
  });
});
