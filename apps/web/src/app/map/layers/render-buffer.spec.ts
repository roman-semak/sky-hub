import { createTrackState } from '@skytrace/geo';
import type { AircraftRecord } from '@skytrace/protocol';
import { describe, expect, it } from 'vitest';
import type { LiveAircraft } from '../../core/live/live-aircraft';
import { ALT_EMERGENCY, ALT_MILITARY, ALT_SELECTED, ALT_UNKNOWN } from './altitude-color';
import { RenderBuffer } from './render-buffer';

const T = 1_700_000_000_000;

function ac(hex: string, over: Partial<AircraftRecord> = {}, fixTime = T): LiveAircraft {
  const record: AircraftRecord = {
    icao: 1,
    nonIcao: false,
    lat: 38.7,
    lon: -9.1,
    alt: 30_000,
    gs: 0,
    track: 90,
    baroRate: 0,
    squawk: null,
    onGround: false,
    mlat: false,
    tisb: false,
    military: false,
    special: false,
    emergency: 'none',
    category: 'A3',
    age: 0,
    ...over,
  };
  return {
    hex,
    record,
    silhouette: 'jet',
    fixTime,
    track: createTrackState({
      lat: record.lat,
      lon: record.lon,
      track: record.track,
      gs: record.gs,
      t: fixTime,
    }),
  };
}

describe('RenderBuffer', () => {
  it('writes positions, angles and sizes', () => {
    const b = new RenderBuffer();
    const map = new Map([['a', ac('a')]]);
    b.fill(map, T, null, false);
    expect(b.count).toBe(1);
    expect(b.positions[0]).toBeCloseTo(-9.1, 4);
    expect(b.positions[1]).toBeCloseTo(38.7, 4);
    // deck.gl angles are counter-clockwise.
    expect(b.angles[0]).toBe(-90);
    expect(b.hexes[0]).toBe('a');
    expect(b.icons[0]).toBe('jet');
    expect(b.sizes[0]).toBeGreaterThan(0);
  });

  it('uses altitude sentinels', () => {
    const b = new RenderBuffer();
    b.fill(
      new Map([
        ['a', ac('a', { alt: null })],
        ['b', ac('b', { emergency: 'general' })],
        ['c', ac('c', { onGround: true, alt: 500 })],
        ['d', ac('d')],
      ]),
      T,
      'd',
      false,
    );
    expect(b.altitudes[0]).toBe(ALT_UNKNOWN);
    expect(b.altitudes[1]).toBe(ALT_EMERGENCY);
    expect(b.altitudes[2]).toBe(0);
    // The selected aircraft is written last so it draws on top.
    expect(b.hexes[3]).toBe('d');
    expect(b.altitudes[3]).toBe(ALT_SELECTED);
  });

  it('fades stale aircraft and drops expired ones', () => {
    const b = new RenderBuffer();
    b.fill(new Map([['a', ac('a', {}, T - 75_000)]]), T, null, false);
    expect(b.colors[3]).toBeGreaterThan(100);
    expect(b.colors[3]).toBeLessThan(200);
    b.fill(new Map([['a', ac('a', {}, T - 200_000)]]), T, null, false);
    expect(b.count).toBe(0);
  });

  it('paints and enlarges military aircraft when the highlight is on', () => {
    const b = new RenderBuffer();
    const map = new Map([
      ['a', ac('a', { military: true })],
      ['b', ac('b')],
    ]);
    b.fill(map, T, null, false, true);
    expect(b.altitudes[0]).toBe(ALT_MILITARY);
    expect(b.altitudes[1]).toBe(30_000);
    expect(b.sizes[0]).toBeGreaterThan(b.sizes[1] ?? 0);
    // Off by default.
    b.fill(map, T, null, false);
    expect(b.altitudes[0]).toBe(30_000);
  });

  it('dims everything when the stream is stale', () => {
    const b = new RenderBuffer();
    b.fill(new Map([['a', ac('a')]]), T, null, true);
    expect(b.colors[3]).toBe(Math.round(255 * 0.3));
  });

  it('grows its arrays', () => {
    const b = new RenderBuffer();
    const many = new Map(
      Array.from({ length: 3000 }, (_, i) => [String(i), ac(String(i))] as const),
    );
    b.fill(many, T, null, false);
    expect(b.count).toBe(3000);
    expect(b.positions.length).toBeGreaterThanOrEqual(6000);
  });
});
