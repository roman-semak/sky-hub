import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvObjects } from '../src/index.js';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and newlines in fields', () => {
    expect(parseCsv('a,"b, c","say ""hi""","multi\nline"\r\nx,y,,z\n')).toEqual([
      ['a', 'b, c', 'say "hi"', 'multi\nline'],
      ['x', 'y', '', 'z'],
    ]);
  });

  it('handles a missing trailing newline and empty input', () => {
    expect(parseCsv('a,b')).toEqual([['a', 'b']]);
    expect(parseCsv('')).toEqual([]);
  });

  it('round-trips arbitrary fields', () => {
    const quote = (s: string): string => `"${s.replace(/"/g, '""')}"`;
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.string(), { minLength: 1, maxLength: 5 }), {
          minLength: 1,
          maxLength: 5,
        }),
        (rows) => {
          const text = rows.map((r) => r.map(quote).join(',')).join('\n') + '\n';
          expect(parseCsv(text)).toEqual(rows);
        },
      ),
    );
  });

  it('maps rows to header keys and skips blank lines', () => {
    expect(parseCsvObjects('id,name\n1,Lisbon\n\n2,Porto\n')).toEqual([
      { id: '1', name: 'Lisbon' },
      { id: '2', name: 'Porto' },
    ]);
    expect(parseCsvObjects('')).toEqual([]);
  });
});
