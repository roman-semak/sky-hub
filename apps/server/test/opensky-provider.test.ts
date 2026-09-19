import { describe, expect, it, vi } from 'vitest';
import { OpenSkyProvider } from '../src/ingest/opensky-provider.js';
import type { FetchFn } from '../src/ingest/provider.js';
import { jsonResponse, makeCircle } from './fixtures.js';

const circle = makeCircle('dyn-x', 0, 179.9, 100);
const sv = [
  '3c6444',
  'DLH9LF  ',
  'Germany',
  1_700_000_000,
  1_700_000_001,
  6.1,
  46.2,
  10_000,
  false,
  230,
  90,
  -5,
  null,
  10_200,
  '7700',
  false,
  2,
];

describe('OpenSkyProvider', () => {
  it('converts state vectors into aircraft with unit conversion', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(
      jsonResponse({
        time: 1_700_000_001,
        states: [sv, [...sv.slice(0, 5), null, null, ...sv.slice(7)], ['broken']],
      }),
    );
    const p = new OpenSkyProvider(30_000, 10_000, fetchFn, () => 0);
    const out = await p.fetchCircle(circle, new AbortController().signal);
    if (out.kind !== 'ok') throw new Error(out.kind);
    expect(out.invalid).toBe(1);
    expect(out.aircraft).toHaveLength(1);
    expect(out.aircraft[0]).toMatchObject({
      hex: '3c6444',
      callsign: 'DLH9LF',
      altBaro: 32808,
      gs: 447.1,
      baroRate: -984,
      emergency: 'general',
      mlat: true,
      posTime: 1_700_000_000_000,
    });
    // Antimeridian-crossing bbox: only one half is requested.
    expect(fetchFn.mock.calls[0]?.[0]).toMatch(/lomax=180/);
  });

  it('serves repeated requests from cache within the TTL', async () => {
    let now = 0;
    const fetchFn = vi
      .fn<FetchFn>()
      .mockImplementation(async () => jsonResponse({ time: 1, states: null }));
    const p = new OpenSkyProvider(30_000, 10_000, fetchFn, () => now);
    await p.fetchCircle(circle, new AbortController().signal);
    now = 5_000;
    await p.fetchCircle(circle, new AbortController().signal);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now = 11_000;
    await p.fetchCircle(circle, new AbortController().signal);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('reports errors', async () => {
    const signal = new AbortController().signal;
    const mk = (f: FetchFn): OpenSkyProvider => new OpenSkyProvider(1, 1, f, () => 0);
    expect(
      await mk(async () => new Response('', { status: 429 })).fetchCircle(circle, signal),
    ).toEqual({
      kind: 'rate-limited',
      status: 429,
    });
    expect(
      await mk(async () => new Response('', { status: 500 })).fetchCircle(circle, signal),
    ).toMatchObject({
      kind: 'error',
      status: 500,
    });
    expect(
      await mk(async () => jsonResponse({ nope: 1 })).fetchCircle(circle, signal),
    ).toMatchObject({ kind: 'error' });
    expect(
      await mk(async () => {
        throw new Error('down');
      }).fetchCircle(circle, signal),
    ).toMatchObject({ kind: 'error', message: 'down' });
  });

  it('handles null callsign and ground state', async () => {
    const ground = [...sv];
    ground[1] = null;
    ground[8] = true;
    ground[9] = null;
    ground[13] = null;
    ground[14] = null;
    const p = new OpenSkyProvider(
      1,
      1,
      async () => jsonResponse({ time: 1, states: [ground] }),
      () => 0,
    );
    const out = await p.fetchCircle(makeCircle('a', 46, 6, 50), new AbortController().signal);
    expect(out.kind === 'ok' && out.aircraft[0]).toMatchObject({
      callsign: null,
      onGround: true,
      altBaro: 0,
      gs: null,
      altGeom: null,
      squawk: null,
      emergency: 'none',
    });
  });
});
