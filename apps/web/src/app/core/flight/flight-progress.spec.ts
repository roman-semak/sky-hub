import { describe, expect, it } from 'vitest';
import type { FlightRoute } from '../api/api-types';
import { flightPhase, flightProgress, phaseLabel, type FlightPhase } from './flight-progress';

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
