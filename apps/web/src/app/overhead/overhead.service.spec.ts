import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FETCH_FN } from '../core/live/aircraft-meta.service';
import { bearingLabel, OverheadService } from './overhead.service';

const AC = {
  hex: '4951ab',
  callsign: 'TAP123',
  registration: 'CS-TJF',
  typeCode: 'A20N',
  altitude: 12000,
  gs: 300,
  track: 90,
  lat: 38.75,
  lon: -9.12,
  azimuth: 200,
  elevation: 42,
  slantRangeNm: 3.2,
  groundRangeNm: 2.4,
};

function setup(geolocation: unknown, fetchFn: typeof fetch): OverheadService {
  vi.stubGlobal('navigator', { geolocation });
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: FETCH_FN, useValue: fetchFn }],
  });
  return TestBed.inject(OverheadService);
}

const ok = (): Response =>
  new Response(JSON.stringify({ aircraft: [AC], generatedAt: 1_790_000_000_000 }));

describe('OverheadService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('locates, asks the server and ranks what is above', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok());
    const geo = {
      getCurrentPosition: (cb: PositionCallback) => {
        cb({ coords: { latitude: 38.7, longitude: -9.1, accuracy: 25 } } as GeolocationPosition);
      },
    };
    const s = setup(geo, fetchFn);
    s.start();
    expect(s.state()).toBe('ready');
    await vi.waitFor(() => {
      expect(s.top()?.hex).toBe('4951ab');
    });
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      '/api/overhead?lat=38.70000&lon=-9.10000&limit=8',
    );
    expect(s.position()).toEqual({ lat: 38.7, lon: -9.1, accuracyM: 25 });
    s.stop();
  });

  it('reports denial, missing geolocation and falls back to a manual point', async () => {
    const denied = {
      getCurrentPosition: (_: PositionCallback, err: PositionErrorCallback) => {
        err({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
      },
    };
    const fetchFn = vi.fn().mockResolvedValue(ok());
    const s = setup(denied, fetchFn);
    s.start();
    expect(s.state()).toBe('denied');
    s.useManual(50, 10);
    expect(s.state()).toBe('ready');
    await vi.waitFor(() => {
      expect(s.aircraft()).toHaveLength(1);
    });
    s.stop();
    TestBed.resetTestingModule();

    const none = setup(undefined, fetchFn);
    none.start();
    expect(none.state()).toBe('unavailable');
  });

  it('keeps the last answer when the server fails', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(ok()).mockRejectedValue(new Error('offline'));
    const s = setup({ getCurrentPosition: () => undefined }, fetchFn);
    s.useManual(38.7, -9.1);
    await vi.waitFor(() => {
      expect(s.aircraft()).toHaveLength(1);
    });
    s.useManual(38.7, -9.1);
    await vi.waitFor(() => {
      expect(fetchFn.mock.calls.length).toBeGreaterThan(1);
    });
    expect(s.aircraft()).toHaveLength(1);
    s.stop();
  });
});

describe('bearingLabel', () => {
  it('adds the compass point', () => {
    expect(bearingLabel(200.4)).toBe('200° SSW');
    expect(bearingLabel(0)).toBe('0° N');
  });
});
