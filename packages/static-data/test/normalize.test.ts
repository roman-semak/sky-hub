import { describe, expect, it } from 'vitest';
import { normalizeAirlines, normalizeAirports, normalizeTypes } from '../src/index.js';

const AIRPORTS = [
  '"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code","gps_code","local_code","home_link","wikipedia_link","keywords"',
  '1,"LPPT","large_airport","Humberto Delgado Airport","38.7813","-9.13592","374","EU","PT","PT-11","Lisbon","yes","LPPT","LIS","LPPT","","","",""',
  '2,"LPPT","small_airport","Duplicate","38.7","-9.1","","EU","PT","PT-11","","no","","","","","","",""',
  '3,"PT-0001","small_airport","Farm Strip","39.1","-8.1","120","EU","PT","PT-11","","no","","","LPSR","","","",""',
  '4,"PT-0002","small_airport","No Code","39.2","-8.2","","EU","PT","PT-11","","no","","","","","","",""',
  '5,"LPHE","heliport","Heliport","38.7","-9.1","","EU","PT","PT-11","","no","LPHE","","","","","",""',
  '6,"KJFK","large_airport","John F Kennedy Intl","40.63980103","-73.77890015","13","NA","US","US-NY","New York","yes","KJFK","JFK","KJFK","","","",""',
].join('\n');

describe('normalizeAirports', () => {
  const out = normalizeAirports(AIRPORTS);

  it('keeps land airports with 4-letter ICAO codes, taken from gps_code when needed', () => {
    expect(out.map((a) => a.icao)).toEqual(['KJFK', 'LPPT', 'LPSR']);
  });

  it('normalizes fields and resolves duplicates to the biggest field', () => {
    expect(out.find((a) => a.icao === 'LPPT')).toEqual({
      icao: 'LPPT',
      iata: 'LIS',
      name: 'Humberto Delgado Airport',
      city: 'Lisbon',
      country: 'PT',
      lat: 38.7813,
      lon: -9.13592,
      elevationFt: 374,
      kind: 'large',
    });
    expect(out.find((a) => a.icao === 'KJFK')?.lat).toBe(40.6398);
    expect(out.find((a) => a.icao === 'LPSR')).toMatchObject({
      iata: null,
      city: null,
      elevationFt: 120,
    });
  });
});

describe('normalizeAirlines', () => {
  it('parses OpenFlights rows and prefers active operators', () => {
    const dat = [
      '-1,"Unknown",\\N,"-","N/A",\\N,\\N,"Y"',
      '1,"TAP Air Portugal",\\N,"TP","TAP","AIR PORTUGAL","Portugal","Y"',
      '2,"Old TAP",\\N,"","TAP","","Portugal","N"',
      '3,"KLM",\\N,"KL","KLM","KLM","Netherlands","N"',
      '4,"KLM Royal Dutch",\\N,"KL","KLM","KLM","Netherlands","Y"',
      '5,"No ICAO",\\N,"XX","","","Nowhere","Y"',
    ].join('\n');
    expect(normalizeAirlines(dat)).toEqual([
      { icao: 'KLM', iata: 'KL', name: 'KLM Royal Dutch', callsign: 'KLM', country: 'Netherlands' },
      {
        icao: 'TAP',
        iata: 'TP',
        name: 'TAP Air Portugal',
        callsign: 'AIR PORTUGAL',
        country: 'Portugal',
      },
    ]);
  });
});

describe('normalizeTypes', () => {
  it('parses the Mictronics type table', () => {
    expect(
      normalizeTypes({
        A20N: ['AIRBUS A-320neo', 'L2J', 'M'],
        B744: ['BOEING 747-400', 'L4J', 'H'],
        bad: ['x'],
        EMPTY: ['', 'L1P', 'L'],
        X1: ['Thing', '', ''],
        NOPE: 'string',
      }),
    ).toEqual([
      { code: 'A20N', name: 'AIRBUS A-320neo', desc: 'L2J', wtc: 'M' },
      { code: 'B744', name: 'BOEING 747-400', desc: 'L4J', wtc: 'H' },
      { code: 'X1', name: 'Thing', desc: null, wtc: null },
    ]);
    expect(normalizeTypes(null)).toEqual([]);
  });
});
