import { StaticIndex } from '@skytrace/static-data';
import { describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../src/logger.js';
import type { FlightRoute } from '../src/routes/route.js';
import {
  AdsbdbRouteProvider,
  AdsbLolRouteProvider,
  canonicalizeRoute,
  type RouteProvider,
} from '../src/routes/route-providers.js';
import { RouteService } from '../src/routes/route-service.js';
import { jsonResponse } from './fixtures.js';

const ROUTE: FlightRoute = {
  callsign: 'TAP123',
  origin: { icao: 'LPMA', iata: 'FNC', name: 'Madeira', city: 'Funchal', lat: 32.69, lon: -16.77 },
  destination: {
    icao: 'LPPT',
    iata: 'LIS',
    name: 'Lisbon',
    city: 'Lisbon',
    lat: 38.78,
    lon: -9.13,
  },
  airline: 'TAP Portugal',
  source: 'adsbdb',
};

function provider(
  impl: RouteProvider['lookup'],
  id: FlightRoute['source'] = 'adsbdb',
): RouteProvider & { calls: () => number } {
  const lookup = vi.fn(impl);
  return { id, lookup, calls: () => lookup.mock.calls.length };
}

describe('RouteService', () => {
  it('validates, normalizes and caches hits', async () => {
    const p = provider(async () => ROUTE);
    const s = new RouteService([p], null, silentLogger);
    expect(await s.lookup(' tap123 ')).toEqual(ROUTE);
    expect(await s.lookup('TAP123')).toEqual(ROUTE);
    expect(p.calls()).toBe(1);
    expect(await s.lookup('bad callsign!')).toBeNull();
    expect(s.size).toBe(1);
  });

  it('falls through the provider chain on miss or error', async () => {
    const broken = provider(async () => {
      throw new Error('HTTP 503');
    }, 'adsb.lol');
    const empty = provider(async () => null, 'adsb.lol');
    const good = provider(async () => ROUTE);
    expect(await new RouteService([broken, good], null, silentLogger).lookup('TAP123')).toEqual(
      ROUTE,
    );
    expect(await new RouteService([empty, good], null, silentLogger).lookup('TAP123')).toEqual(
      ROUTE,
    );
  });

  it('caches misses for a shorter time and expires entries', async () => {
    let now = 0;
    const p = provider(async () => null);
    const s = new RouteService(
      [p],
      null,
      silentLogger,
      { hitTtlMs: 1000, missTtlMs: 100, maxEntries: 10 },
      () => now,
    );
    expect(await s.lookup('KLM1')).toBeNull();
    await s.lookup('KLM1');
    expect(p.calls()).toBe(1);
    now = 200;
    await s.lookup('KLM1');
    expect(p.calls()).toBe(2);
  });

  it('does not cache when every provider is unreachable', async () => {
    const p = provider(async () => {
      throw new Error('offline');
    });
    const s = new RouteService([p], null, silentLogger);
    await s.lookup('TAP1');
    await s.lookup('TAP1');
    expect(p.calls()).toBe(2);
  });

  it('shares concurrent lookups and bounds the cache', async () => {
    const p = provider(async (cs) => ({ ...ROUTE, callsign: cs }));
    const s = new RouteService([p], null, silentLogger, {
      hitTtlMs: 1e9,
      missTtlMs: 1e9,
      maxEntries: 2,
    });
    await Promise.all([s.lookup('AAA1'), s.lookup('AAA1')]);
    expect(p.calls()).toBe(1);
    await s.lookup('BBB1');
    await s.lookup('CCC1');
    expect(s.size).toBe(2);
  });
});

describe('route providers', () => {
  it('parses adsbdb responses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        response: {
          flightroute: {
            airline: { name: 'TAP Portugal' },
            origin: {
              icao_code: 'LPMA',
              iata_code: 'FNC',
              name: 'Madeira',
              municipality: 'Funchal',
              latitude: 32.7,
              longitude: -16.8,
            },
            destination: {
              icao_code: 'LPPT',
              iata_code: 'LIS',
              name: 'Lisbon',
              municipality: null,
              latitude: 38.8,
              longitude: -9.1,
            },
          },
        },
      }),
    );
    const r = await new AdsbdbRouteProvider(fetchFn).lookup('TAP88TM');
    expect(r).toMatchObject({
      source: 'adsbdb',
      airline: 'TAP Portugal',
      origin: { icao: 'LPMA', city: 'Funchal' },
      destination: { city: null },
    });
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe('https://api.adsbdb.com/v0/callsign/TAP88TM');
  });

  it('treats unknown callsigns and garbage as no route', async () => {
    expect(
      await new AdsbdbRouteProvider(async () =>
        jsonResponse({ response: 'unknown callsign' }),
      ).lookup('X1'),
    ).toBeNull();
    expect(
      await new AdsbdbRouteProvider(async () => new Response('', { status: 404 })).lookup('X1'),
    ).toBeNull();
    await expect(
      new AdsbdbRouteProvider(async () => new Response('', { status: 500 })).lookup('X1'),
    ).rejects.toThrow('HTTP 500');
  });

  it('parses adsb.lol routeset and handles its empty 201 reply', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          callsign: 'TAP123',
          airline_code: 'TAP',
          _airports: [
            {
              icao: 'LPMA',
              iata: 'FNC',
              name: 'Madeira',
              location: 'Funchal',
              lat: 32.7,
              lon: -16.8,
            },
            { icao: 'LPPT', lat: 38.8, lon: -9.1 },
          ],
        },
      ]),
    );
    const r = await new AdsbLolRouteProvider(fetchFn).lookup('TAP123', 38, -9);
    expect(r).toMatchObject({
      source: 'adsb.lol',
      origin: { city: 'Funchal' },
      destination: { icao: 'LPPT', name: 'LPPT' },
    });
    const init = fetchFn.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      planes: [{ callsign: 'TAP123', lat: 38, lng: -9 }],
    });
    expect(
      await new AdsbLolRouteProvider(async () => new Response('', { status: 201 })).lookup(
        'TAP1',
        null,
        null,
      ),
    ).toBeNull();
  });

  it('canonicalizes airports against the static table', () => {
    const idx = new StaticIndex({
      version: 1,
      generatedAt: '',
      airports: [
        {
          icao: 'LPPT',
          iata: 'LIS',
          name: 'Humberto Delgado',
          city: 'Lisbon',
          country: 'PT',
          lat: 38.78,
          lon: -9.13,
          elevationFt: 374,
          kind: 'large',
        },
      ],
      airlines: [],
      types: [],
    });
    const r = canonicalizeRoute(ROUTE, idx);
    expect(r.destination.name).toBe('Humberto Delgado');
    expect(r.origin).toEqual(ROUTE.origin);
    expect(canonicalizeRoute(ROUTE, null)).toBe(ROUTE);
  });
});
