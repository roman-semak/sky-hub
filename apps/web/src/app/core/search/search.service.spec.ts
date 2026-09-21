import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FETCH_FN } from '../live/aircraft-meta.service';
import { SearchService } from './search.service';

function setup(fetchFn: typeof fetch): SearchService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: FETCH_FN, useValue: fetchFn }],
  });
  return TestBed.inject(SearchService);
}

describe('SearchService', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('queries the API with kind and returns results', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ results: [{ kind: 'airline', icao: 'TAP' }] })),
      );
    const s = setup(fetchFn);
    const r = await s.search(' tap ', 'airlines');
    expect(r).toHaveLength(1);
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe('/api/search?q=tap&kind=airlines&limit=20');
  });

  it('skips short queries and swallows errors', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('offline'));
    const s = setup(fetchFn);
    expect(await s.search('t', 'flights')).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await s.search('tap', 'flights')).toEqual([]);
  });

  it('returns nothing on HTTP errors', async () => {
    const s = setup(async () => new Response('', { status: 500 }));
    expect(await s.search('tap', 'flights')).toEqual([]);
  });

  it('remembers recent searches, newest first, deduplicated', () => {
    const s = setup(vi.fn());
    s.remember({ label: 'LPPT', query: 'lisbon', kind: 'airports' });
    s.remember({ label: 'TAP123', query: 'tap123', kind: 'flights' });
    s.remember({ label: 'LPPT', query: 'lisbon', kind: 'airports' });
    expect(s.recent().map((r) => r.label)).toEqual(['LPPT', 'TAP123']);
    TestBed.resetTestingModule();
    expect(setup(vi.fn() as unknown as typeof fetch).recent()).toHaveLength(2);
  });
});
