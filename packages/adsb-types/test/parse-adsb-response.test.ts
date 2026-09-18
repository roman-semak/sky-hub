import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAdsbResponse } from '../src/index.js';

const fixture: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/adsb-lol-frankfurt.json', import.meta.url), 'utf8'),
);

describe('parseAdsbResponse', () => {
  it('parses a real adsb.lol response without dropping entries', () => {
    const result = parseAdsbResponse(fixture);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.invalid).toBe(0);
    expect(result.value.aircraft.length + result.value.positionless).toBeGreaterThan(0);
    for (const ac of result.value.aircraft) {
      expect(ac.hex).toMatch(/^~?[0-9a-f]{6}$/);
      expect(ac.callsign ?? '').not.toMatch(/\s$/);
      expect(Number.isFinite(ac.lat)).toBe(true);
    }
  });

  it('rejects a broken envelope without throwing', () => {
    const result = parseAdsbResponse({ foo: 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects non-object bodies', () => {
    expect(parseAdsbResponse(null).ok).toBe(false);
    expect(parseAdsbResponse('<html>').ok).toBe(false);
  });

  it('skips invalid aircraft and counts positionless ones', () => {
    const result = parseAdsbResponse({
      now: 1_700_000_000_000,
      ac: [
        { hex: 'zzzzzz', lat: 1, lon: 1 },
        { hex: 'abc123', lat: 200, lon: 1 },
        { hex: 'abc124' },
        { hex: 'ABC125', lat: 10, lon: 20, alt_baro: 'ground', flight: 'TAP123  ' },
        42,
      ],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.invalid).toBe(3);
    expect(result.value.positionless).toBe(1);
    expect(result.value.aircraft).toHaveLength(1);
    const [ac] = result.value.aircraft;
    expect(ac?.hex).toBe('abc125');
    expect(ac?.callsign).toBe('TAP123');
    expect(ac?.onGround).toBe(true);
    expect(ac?.altBaro).toBe(0);
  });

  it('keeps unknown fields from breaking validation', () => {
    const result = parseAdsbResponse({
      now: 0,
      ac: [{ hex: 'aaaaaa', lat: 0, lon: 0, brand_new_field: { x: 1 } }],
      extra: true,
    });
    expect(result.ok && result.value.aircraft.length).toBe(1);
  });
});
