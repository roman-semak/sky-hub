import { describe, expect, it } from 'vitest';
import {
  formatAirport,
  formatFlight,
  formatOverhead,
  formatSearch,
  formatStats,
  formatTrack,
} from '../src/format.js';

describe('formatting unknowns', () => {
  it('names an aircraft by hex when it has no callsign, and flags military', () => {
    const text = formatFlight({
      hex: 'ae1234',
      callsign: null,
      registration: null,
      typeCode: null,
      lat: 51.5,
      lon: -0.1,
      altBaro: null,
      gs: null,
      track: null,
      baroRate: null,
      squawk: null,
      emergency: 'general',
      military: true,
      onGround: true,
      posTime: Date.UTC(2026, 8, 23, 10, 0, 0),
      country: null,
      airline: null,
      aircraftType: null,
    });
    expect(text).toContain('AE1234');
    expect(text).toContain('Type: unknown');
    expect(text).toContain('Operator: unknown');
    expect(text).toContain('On ground');
    expect(text).toContain('Squawk: none · emergency: general');
    expect(text).not.toContain('vertical rate 0 ft/min');
    expect(text).toContain('Flagged military');
  });

  it('says an unknown vertical rate is unknown, not level flight', () => {
    const text = formatFlight({
      hex: 'abc123',
      callsign: 'TAP1',
      registration: null,
      typeCode: null,
      lat: 0,
      lon: 0,
      altBaro: 30_000,
      gs: 400,
      track: 90,
      baroRate: null,
      squawk: null,
      emergency: 'none',
      military: false,
      onGround: false,
      posTime: Date.UTC(2026, 8, 23, 10, 0, 0),
      country: null,
      airline: null,
      aircraftType: null,
    });
    expect(text).toContain('vertical rate unknown');
  });

  it('keeps rows readable when speeds and altitudes are missing', () => {
    const text = formatTrack(
      {
        hex: 'abc123',
        points: [{ t: Date.UTC(2026, 8, 23, 10, 0, 0), lat: 1, lon: 2, alt: null, gs: null }],
      },
      40,
    );
    expect(text).toContain('alt unknown');
    expect(text).toContain('speed unknown');
  });

  it('renders search hits without optional codes', () => {
    const text = formatSearch([
      {
        kind: 'aircraft',
        hex: 'abc123',
        callsign: null,
        registration: null,
        typeCode: null,
        lat: 1,
        lon: 2,
      },
      { kind: 'airport', icao: 'UKBB', iata: null, name: 'Boryspil', country: 'UA' },
      { kind: 'airline', name: 'Unknown Air', icao: null },
    ]);
    expect(text).toContain('type unknown');
    expect(text).toContain('airport · UKBB · Boryspil');
    expect(text).toContain('airline · Unknown Air');
  });

  it('describes a quiet airport with no weather', () => {
    const text = formatAirport({
      icao: 'UKBB',
      iata: null,
      name: 'Boryspil',
      country: 'Ukraine',
      lat: 50.34,
      lon: 30.89,
      metar: null,
      taf: null,
      traffic: [],
    });
    expect(text).toContain('No METAR available.');
    expect(text).toContain('No traffic within 50 nm.');
  });

  it('marks a variable wind and an aircraft without a type', () => {
    const text = formatAirport({
      icao: 'LPPT',
      iata: 'LIS',
      name: 'Lisbon',
      country: 'Portugal',
      lat: 38.77,
      lon: -9.13,
      metar: {
        raw: 'LPPT VRB03KT',
        observedAt: Date.UTC(2026, 8, 23, 10, 0, 0),
        windDir: null,
        windKt: null,
        visibility: null,
        category: null,
      },
      taf: null,
      traffic: [
        {
          hex: 'abc123',
          callsign: null,
          typeCode: null,
          role: 'overflight',
          distanceNm: 30,
          altitude: null,
        },
      ],
    });
    expect(text).toContain('Wind VRB — kt');
    expect(text).toContain('category unknown');
    expect(text).toContain('overflight (1):');
  });

  it('lists emergency squawks without a callsign', () => {
    const text = formatStats({
      generatedAt: Date.UTC(2026, 8, 23, 10, 0, 0),
      total: 1,
      airborne: 1,
      onGround: 0,
      military: 0,
      emergencies: [{ hex: 'abc123', callsign: null, squawk: null }],
      altitudeBands: [[0, 0]],
      topOperators: [],
      topTypes: [],
    });
    expect(text).toContain('ABC123 (unknown)');
    // A band with no aircraft is not worth a line.
    expect(text).not.toContain('FL000+');
  });

  it('falls back to the hex overhead too', () => {
    const text = formatOverhead({
      observer: { lat: 0, lon: 0, elevationFt: 0 },
      aircraft: [
        {
          hex: 'abc123',
          callsign: null,
          registration: null,
          typeCode: null,
          altitude: null,
          gs: null,
          azimuth: 10,
          elevation: 5,
          slantRangeNm: 50,
          groundRangeNm: 49,
        },
      ],
    });
    expect(text).toContain('ABC123 · type unknown');
  });
});
