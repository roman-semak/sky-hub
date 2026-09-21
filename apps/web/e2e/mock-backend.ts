import type { Page } from '@playwright/test';
import { encodeAircraftFrame, FrameType, type AircraftRecord } from '@skytrace/protocol';

/** A TAP flight between Porto and Lisbon, used by the e2e scenarios. */
export const TAP_FLIGHT = {
  hex: '4951ab',
  callsign: 'TAP1234',
  registration: 'CS-TJF',
  lat: 40.2,
  lon: -8.6,
} as const;

const record: AircraftRecord = {
  icao: 0x4951ab,
  nonIcao: false,
  lat: TAP_FLIGHT.lat,
  lon: TAP_FLIGHT.lon,
  alt: 21_000,
  gs: 390,
  track: 190,
  baroRate: -1200,
  squawk: '4521',
  onGround: false,
  mlat: false,
  tisb: false,
  military: false,
  special: false,
  emergency: 'none',
  category: 'A3',
  age: 0,
};

const MINIMAL_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#1a1e2e' } }],
};

/**
 * Replaces the server and third-party tiles with deterministic fixtures:
 * REST via `page.route`, the binary stream via `page.routeWebSocket`.
 */
export async function mockBackend(page: Page): Promise<void> {
  await page.route('https://basemaps.cartocdn.com/**', (route) =>
    route.fulfill({ json: MINIMAL_STYLE }),
  );

  await page.routeWebSocket(/\/stream$/, (ws) => {
    const now = Date.now();
    ws.send(JSON.stringify({ t: 'hello', version: 1, serverTime: now }));
    ws.send(Buffer.from(encodeAircraftFrame(FrameType.Snapshot, Math.floor(now / 1000), [record])));
    ws.onMessage((msg) => {
      if (typeof msg !== 'string') return;
      const m = JSON.parse(msg) as { t: string; id?: number };
      if (m.t === 'preview') ws.send(JSON.stringify({ t: 'preview', id: m.id, count: 1 }));
    });
  });

  await page.route('**/api/search?**', (route) =>
    route.fulfill({
      json: {
        results: [
          {
            kind: 'aircraft',
            hex: TAP_FLIGHT.hex,
            callsign: TAP_FLIGHT.callsign,
            registration: TAP_FLIGHT.registration,
            typeCode: 'A20N',
            lat: TAP_FLIGHT.lat,
            lon: TAP_FLIGHT.lon,
            rank: 1,
          },
          {
            kind: 'airline',
            icao: 'TAP',
            iata: 'TP',
            name: 'TAP Air Portugal',
            callsign: 'AIR PORTUGAL',
            country: 'Portugal',
          },
        ],
      },
    }),
  );

  await page.route(`**/api/ac/${TAP_FLIGHT.hex}`, (route) =>
    route.fulfill({
      json: {
        hex: TAP_FLIGHT.hex,
        callsign: TAP_FLIGHT.callsign,
        registration: TAP_FLIGHT.registration,
        typeCode: 'A20N',
        country: 'PT',
        airline: { icao: 'TAP', iata: 'TP', name: 'TAP Air Portugal' },
        aircraftType: { code: 'A20N', name: 'AIRBUS A-320neo', wtc: 'M' },
      },
    }),
  );

  await page.route(`**/api/route/${TAP_FLIGHT.callsign}`, (route) =>
    route.fulfill({
      json: {
        callsign: TAP_FLIGHT.callsign,
        origin: {
          icao: 'LPPR',
          iata: 'OPO',
          name: 'Francisco Sá Carneiro Airport',
          city: 'Porto',
          lat: 41.2481,
          lon: -8.6814,
        },
        destination: {
          icao: 'LPPT',
          iata: 'LIS',
          name: 'Humberto Delgado Airport',
          city: 'Lisbon',
          lat: 38.7813,
          lon: -9.1359,
        },
        airline: 'TAP Air Portugal',
        source: 'adsbdb',
      },
    }),
  );

  await page.route(`**/api/track/${TAP_FLIGHT.hex}`, (route) =>
    route.fulfill({
      json: {
        hex: TAP_FLIGHT.hex,
        raw: 3,
        points: [
          {
            t: Date.now() - 120_000,
            lat: 40.9,
            lon: -8.55,
            alt: 14_000,
            gs: 330,
            track: 190,
            vr: 1500,
          },
          {
            t: Date.now() - 60_000,
            lat: 40.55,
            lon: -8.58,
            alt: 23_000,
            gs: 380,
            track: 190,
            vr: 0,
          },
          {
            t: Date.now(),
            lat: TAP_FLIGHT.lat,
            lon: TAP_FLIGHT.lon,
            alt: 21_000,
            gs: 390,
            track: 190,
            vr: -1200,
          },
        ],
      },
    }),
  );
}
