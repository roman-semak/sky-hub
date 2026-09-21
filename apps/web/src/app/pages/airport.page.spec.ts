import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FETCH_FN } from '../core/live/aircraft-meta.service';
import { AirportPage } from './airport.page';

const LPPT = {
  icao: 'LPPT',
  iata: 'LIS',
  name: 'Humberto Delgado Airport',
  city: 'Lisbon',
  country: 'PT',
  lat: 38.78,
  lon: -9.13,
  elevationFt: 374,
  metar: {
    raw: 'METAR LPPT 211330Z 08006G21KT CAVOK 31/14 Q1022 NOSIG',
    observedAt: Date.UTC(2026, 8, 21, 13, 30),
    tempC: 31,
    dewpointC: 14,
    windDir: 80,
    windKt: 6,
    gustKt: 21,
    visibility: '6+',
    qnhHpa: 1022,
    category: 'VFR',
  },
  taf: { raw: 'TAF LPPT 211100Z …', validFrom: 0, validTo: 1 },
  windHistory: [{ dir: 80, kt: 6 }],
  traffic: [
    {
      hex: '4951ab',
      callsign: 'TAP541W',
      typeCode: 'A20N',
      role: 'arrival',
      distanceNm: 3.3,
      altitude: 825,
      gs: 140,
      baroRate: -960,
    },
    {
      hex: '4951ac',
      callsign: 'TAP1',
      typeCode: 'A321',
      role: 'departure',
      distanceNm: 8,
      altitude: 6000,
      gs: 250,
      baroRate: 2400,
    },
  ],
};

function render(fetchFn: typeof fetch) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: FETCH_FN, useValue: fetchFn },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ icao: 'lppt' }) } },
      },
    ],
  });
  return TestBed.createComponent(AirportPage);
}

describe('AirportPage', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows weather, the wind rose and arrivals first', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => new Response(JSON.stringify(LPPT)));
    const fixture = render(fetchFn);
    const el = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.textContent).toContain('LPPT · LIS');
    });
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe('/api/airport/LPPT');
    expect(el.textContent).toContain('080° 6 kt G21');
    expect(el.querySelector('[data-testid="metar"]')?.textContent).toContain('VFR');
    expect(el.querySelector('st-wind-rose svg')).not.toBeNull();
    const traffic = el.querySelector('[data-testid="traffic"]')?.textContent ?? '';
    expect(traffic).toContain('TAP541W');
    expect(traffic).not.toContain('TAP1 ');
    el.querySelector<HTMLButtonElement>('[data-testid="tab-departure"]')?.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="traffic"]')?.textContent).toContain('TAP1');
  });

  it('reports unknown airports', async () => {
    const fixture = render(async () => new Response('', { status: 404 }));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'No airport with this ICAO or IATA code.',
      );
    });
  });
});
