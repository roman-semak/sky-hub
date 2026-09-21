import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FETCH_FN } from '../core/live/aircraft-meta.service';
import { StatsPage } from './stats.page';

describe('StatsPage', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders counters, histograms and emergencies', async () => {
    const stats = {
      generatedAt: Date.UTC(2026, 8, 21, 12),
      total: 12345,
      airborne: 10000,
      onGround: 2345,
      military: 42,
      emergencies: [{ hex: 'ae1234', callsign: 'RCH123', squawk: '7700', kind: 'general' }],
      altitudeBands: [
        [0, 100],
        [35000, 400],
        [45000, 5],
      ],
      topOperators: [
        ['RYR', 300],
        ['TAP', 50],
      ],
      topTypes: [['A20N', 200]],
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: FETCH_FN,
          useValue: vi.fn().mockImplementation(async () => new Response(JSON.stringify(stats))),
        },
      ],
    });
    const fixture = TestBed.createComponent(StatsPage);
    const el = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="stat-Tracked"]')?.textContent).toBe('12 345');
    });
    expect(el.textContent).toContain('RCH123');
    expect(el.textContent).toContain('FL350');
    expect(el.textContent).toContain('FL450+');
    expect(el.textContent).toContain('RYR');
  });
});
