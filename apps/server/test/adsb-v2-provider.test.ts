import { describe, expect, it, vi } from 'vitest';
import { ADSB_V2_MIRRORS, AdsbV2Provider } from '../src/ingest/adsb-v2-provider.js';
import type { FetchFn } from '../src/ingest/provider.js';
import { jsonResponse, makeCircle } from './fixtures.js';

const circle = makeCircle('c', 38.77, -9.13, 400);

function provider(fetchFn: FetchFn): AdsbV2Provider {
  return new AdsbV2Provider(
    { id: 'test', url: ADSB_V2_MIRRORS['adsb.lol'], minIntervalMs: 1000 },
    fetchFn,
  );
}

describe('AdsbV2Provider', () => {
  it('builds mirror URLs and caps the radius at 250 nm', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(jsonResponse({ now: 1, ac: [] }));
    await provider(fetchFn).fetchCircle(circle, new AbortController().signal);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      'https://api.adsb.lol/v2/lat/38.770/lon/-9.130/dist/250',
    );
    expect(ADSB_V2_MIRRORS['adsb.fi'](1, 2, 3)).toContain(
      'opendata.adsb.fi/api/v2/lat/1.000/lon/2.000/dist/3',
    );
    expect(ADSB_V2_MIRRORS['airplanes.live'](1, 2, 3)).toContain('/v2/point/1.000/2.000/3');
    expect(ADSB_V2_MIRRORS['adsb.one'](1, 2, 3)).toContain('api.adsb.one');
  });

  it('parses aircraft', async () => {
    const p = provider(async () =>
      jsonResponse({
        now: 1_700_000_000_000,
        ac: [{ hex: 'aaaaaa', lat: 1, lon: 2 }, { hex: 'bad' }],
      }),
    );
    const out = await p.fetchCircle(circle, new AbortController().signal);
    expect(out).toMatchObject({ kind: 'ok', invalid: 1 });
    expect(out.kind === 'ok' && out.aircraft).toHaveLength(1);
  });

  it('classifies 429 and 420 as rate limiting', async () => {
    for (const status of [429, 420]) {
      const out = await provider(async () => new Response('slow down', { status })).fetchCircle(
        circle,
        new AbortController().signal,
      );
      expect(out).toEqual({ kind: 'rate-limited', status });
    }
  });

  it('reports HTTP, network, JSON and schema errors without throwing', async () => {
    const signal = new AbortController().signal;
    expect(
      await provider(async () => new Response('x', { status: 503 })).fetchCircle(circle, signal),
    ).toMatchObject({
      kind: 'error',
      status: 503,
    });
    expect(
      await provider(async () => {
        throw new TypeError('fetch failed');
      }).fetchCircle(circle, signal),
    ).toMatchObject({ kind: 'error', status: null, message: 'fetch failed' });
    expect(
      await provider(async () => {
        throw 'weird';
      }).fetchCircle(circle, signal),
    ).toMatchObject({ kind: 'error', message: 'weird' });
    expect(
      await provider(async () => new Response('<html>', { status: 200 })).fetchCircle(
        circle,
        signal,
      ),
    ).toMatchObject({
      kind: 'error',
      status: 200,
    });
    expect(
      await provider(async () => jsonResponse({ error: 'x' })).fetchCircle(circle, signal),
    ).toMatchObject({
      kind: 'error',
    });
  });
});
