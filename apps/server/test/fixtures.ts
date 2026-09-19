import type { Aircraft } from '@skytrace/adsb-types';
import { bboxAroundPoint, METERS_PER_NM, type CoverageCircle } from '@skytrace/geo';

export const T0 = 1_700_000_000_000;

export function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    hex: 'abcdef',
    callsign: 'TAP123',
    registration: 'CS-TJF',
    typeCode: 'A20N',
    lat: 38.77,
    lon: -9.13,
    altBaro: 12000,
    altGeom: 12100,
    onGround: false,
    gs: 300,
    track: 45,
    baroRate: 0,
    squawk: '1000',
    emergency: 'none',
    category: 'A3',
    navAltitudeMcp: null,
    messages: 100,
    rssi: -20,
    mlat: false,
    tisb: false,
    military: false,
    ladd: false,
    pia: false,
    posTime: T0,
    seenTime: T0,
    ...overrides,
  };
}

export function makeCircle(id: string, lat: number, lon: number, radiusNm = 250): CoverageCircle {
  return { id, lat, lon, radiusNm, bbox: bboxAroundPoint(lat, lon, radiusNm * METERS_PER_NM) };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
