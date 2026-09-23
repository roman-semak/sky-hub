import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AircraftMetaService, FETCH_FN } from './aircraft-meta.service';

// jsdom has no IndexedDB at all, which is exactly the case the service
// must survive: the metadata still comes from the API.

const META = {
  hex: '4951ab',
  callsign: 'TAP1234',
  registration: 'CS-TJF',
  typeCode: 'A20N',
  country: 'PT',
  airline: { name: 'TAP Air Portugal' },
  aircraftType: { name: 'AIRBUS A-320neo' },
};

const service = (fetchFn: unknown): AircraftMetaService => {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: FETCH_FN, useValue: fetchFn }],
  });
  return TestBed.inject(AircraftMetaService);
};

describe('AircraftMetaService', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('fills the signal once the metadata arrives', async () => {
    const s = service(async () => new Response(JSON.stringify(META)));
    const meta = s.meta('4951ab');
    await vi.waitFor(() => {
      expect(meta()?.airline).toBe('TAP Air Portugal');
    });
  });

  it('asks again after a failed fetch instead of staying empty forever', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 503 }))
      .mockResolvedValue(new Response(JSON.stringify(META)));
    const s = service(fetchFn);

    const first = s.meta('4951ab');
    await vi.waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
    expect(first()).toBeNull();

    // Reading it again is the caller asking for it again.
    const second = s.meta('4951ab');
    await vi.waitFor(() => {
      expect(second()?.callsign).toBe('TAP1234');
    });
  });
});
