import { describe, expect, it } from 'vitest';
import type { FlightRoute } from '../api/api-types';
import {
  flightPhase,
  flightProgress,
  phaseLabel,
  routePlausible,
  type FlightPhase,
} from './flight-progress';

const route: FlightRoute = {
  callsign: 'TAP88TM',
  origin: {
    icao: 'LPMA',
    iata: 'FNC',
    name: 'Madeira',
    city: 'Funchal',
    lat: 32.6979,
    lon: -16.7745,
  },
  destination: {
    icao: 'LPPT',
    iata: 'LIS',
    name: 'Lisbon',
    city: 'Lisbon',
    lat: 38.7813,
    lon: -9.1359,
  },
  airline: null,
  source: 'adsbdb',
};

describe('flightProgress', () => {
  it('is 0 at the origin and 1 at the destination', () => {
    expect(flightProgress(route, 32.6979, -16.7745, 450).fraction).toBeCloseTo(0, 5);
    expect(flightProgress(route, 38.7813, -9.1359, 450).fraction).toBeCloseTo(1, 5);
  });

  it('reports distances and ETA at ground speed', () => {
    const p = flightProgress(route, 35.7, -13, 450);
    expect(p.fraction).toBeGreaterThan(0.4);
    expect(p.fraction).toBeLessThan(0.6);
    expect(p.flownKm + p.remainingKm).toBeGreaterThan(900);
    expect(p.etaMin).toBeGreaterThan(30);
    expect(p.etaMin).toBeLessThan(50);
  });

  it('omits ETA when slow or unknown', () => {
    expect(flightProgress(route, 35, -13, 20).etaMin).toBeNull();
    expect(flightProgress(route, 35, -13, null).etaMin).toBeNull();
  });

  it('handles a degenerate route', () => {
    const r = { ...route, destination: route.origin };
    expect(flightProgress(r, route.origin.lat, route.origin.lon, 0).fraction).toBe(1);
  });
});

describe('routePlausible', () => {
  it('accepts an aircraft heading for its destination', () => {
    // Between Madeira and Lisbon, tracking north-east, cruising.
    expect(routePlausible(route, 35.7, -13, 55, 0, false)).toBe(true);
    // Descending on final into Lisbon.
    expect(routePlausible(route, 38.7, -9.3, 30, -900, false)).toBe(true);
  });

  it('rejects the opposite leg: climbing out next to the destination', () => {
    expect(routePlausible(route, 38.8, -9.2, 220, 2800, false)).toBe(false);
  });

  it('rejects cruising directly away from the destination', () => {
    expect(routePlausible(route, 35.7, -13, 235, 0, false)).toBe(false);
  });

  it('gives the benefit of the doubt on the ground or without a track', () => {
    expect(routePlausible(route, 38.78, -9.13, 200, 3000, true)).toBe(true);
    expect(routePlausible(route, 38.8, -9.2, null, 2800, false)).toBe(true);
  });
});

describe('flightPhase', () => {
  it('classifies by vertical rate and altitude', () => {
    expect(flightPhase(true, 0, 0)).toBe('ground');
    expect(flightPhase(false, 1500, 5000)).toBe('climbing');
    expect(flightPhase(false, -1200, 9000)).toBe('descending');
    expect(flightPhase(false, 0, 36000)).toBe('cruising');
    expect(flightPhase(false, null, null)).toBe('enroute');
    expect(phaseLabel('cruising')).toBe('Cruising');
    expect(
      ['ground', 'climbing', 'descending', 'enroute'].map((p) => phaseLabel(p as FlightPhase)),
    ).toEqual(['On ground', 'Climbing', 'Descending', 'En route']);
  });
});
