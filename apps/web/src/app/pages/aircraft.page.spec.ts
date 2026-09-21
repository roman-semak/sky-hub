import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FETCH_FN } from '../core/live/aircraft-meta.service';
import { AircraftPage } from './aircraft.page';

const H = Date.UTC(2026, 8, 21, 10);

function render(id: string, fetchFn: typeof fetch) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: FETCH_FN, useValue: fetchFn },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
    ],
  });
  return TestBed.createComponent(AircraftPage);
}

const json = (body: unknown): Response => new Response(JSON.stringify(body));

describe('AircraftPage', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('lists recorded flights for a hex address', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.startsWith('/api/flights/')
        ? json({
            flights: [
              {
                start: H,
                end: H + 95 * 60_000,
                points: 120,
                maxAlt: 36000,
                to: { lat: 1, lon: 2 },
              },
            ],
          })
        : json({
            hex: '4951ab',
            registration: 'CS-TJF',
            callsign: 'TAP1',
            typeCode: 'A20N',
            country: 'PT',
            airline: null,
            aircraftType: null,
          }),
    );
    const fixture = render('4951AB', fetchFn as unknown as typeof fetch);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('1 h 35 min');
    });
    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('FL360');
    expect(text).toContain('120 fixes');
  });

  it('resolves a registration through search', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.startsWith('/api/search')) {
        return json({
          results: [
            {
              kind: 'aircraft',
              hex: '4951ab',
              registration: 'CS-TJF',
              callsign: null,
              typeCode: null,
              lat: 0,
              lon: 0,
            },
          ],
        });
      }
      if (url.startsWith('/api/flights/4951ab')) return json({ flights: [] });
      return new Response('', { status: 404 });
    });
    const fixture = render('cstjf', fetchFn as unknown as typeof fetch);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'No flights in the history window yet.',
      );
    });
  });

  it('reports unknown aircraft', async () => {
    const fixture = render(
      'NOPE',
      vi.fn(async () => json({ results: [] })),
    );
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('no recorded history');
    });
  });
});
