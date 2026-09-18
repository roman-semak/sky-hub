import { describe, expect, it } from 'vitest';
import { normalizeAircraft, resolveEmergency } from '../src/index.js';

const NOW = 1_700_000_000_000;

describe('normalizeAircraft', () => {
  it('returns null without position', () => {
    expect(normalizeAircraft({ hex: 'abcdef', lat: 1 }, NOW)).toBeNull();
  });

  it('maps all fields and derives timestamps', () => {
    const ac = normalizeAircraft(
      {
        hex: '4951AB',
        flight: 'TAP1234 ',
        r: 'CS-TJF',
        t: 'A20N',
        lat: 38.77,
        lon: -9.13,
        alt_baro: 3500,
        alt_geom: 3600,
        gs: 180.5,
        track: 21.3,
        baro_rate: -640,
        squawk: '2271',
        emergency: 'none',
        category: 'A3',
        nav_altitude_mcp: 3000,
        messages: 1000,
        rssi: -20,
        seen: 0.5,
        seen_pos: 2,
        mlat: ['lat', 'lon'],
        tisb: [],
        dbFlags: 1 | 8,
      },
      NOW,
    );
    expect(ac).toEqual({
      hex: '4951ab',
      callsign: 'TAP1234',
      registration: 'CS-TJF',
      typeCode: 'A20N',
      lat: 38.77,
      lon: -9.13,
      altBaro: 3500,
      altGeom: 3600,
      onGround: false,
      gs: 180.5,
      track: 21.3,
      baroRate: -640,
      squawk: '2271',
      emergency: 'none',
      category: 'A3',
      navAltitudeMcp: 3000,
      messages: 1000,
      rssi: -20,
      mlat: true,
      tisb: false,
      military: true,
      ladd: true,
      pia: false,
      posTime: NOW - 2000,
      seenTime: NOW - 500,
    });
  });

  it('fills defaults for a minimal aircraft', () => {
    const ac = normalizeAircraft(
      {
        hex: '~abcdef',
        lat: 0,
        lon: 0,
        flight: '   ',
        type: 'tisb_other',
        geom_rate: 64,
        dbFlags: 4,
      },
      NOW,
    );
    expect(ac).toMatchObject({
      hex: '~abcdef',
      callsign: null,
      altBaro: null,
      baroRate: 64,
      tisb: true,
      pia: true,
      messages: 0,
      posTime: NOW,
    });
  });
});

describe('resolveEmergency', () => {
  it('prefers the explicit field', () => {
    expect(resolveEmergency('minfuel', '7700')).toBe('minfuel');
  });
  it('falls back to emergency squawks', () => {
    expect(resolveEmergency('none', '7500')).toBe('unlawful');
    expect(resolveEmergency(undefined, '7600')).toBe('nordo');
    expect(resolveEmergency(undefined, '7700')).toBe('general');
  });
  it('ignores unknown values', () => {
    expect(resolveEmergency('bogus', '1000')).toBe('none');
    expect(resolveEmergency(undefined, undefined)).toBe('none');
  });
});
