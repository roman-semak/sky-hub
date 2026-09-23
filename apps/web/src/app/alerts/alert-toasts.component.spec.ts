import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { EmergencyAlert } from '@skytrace/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertToastsComponent } from './alert-toasts.component';
import { EmergencyStore } from './emergency.store';

const alert = (hex: string): EmergencyAlert => ({
  hex,
  callsign: 'RSQ1',
  squawk: '7700',
  kind: 'general',
  lat: 40,
  lon: -8,
  military: false,
  at: Date.now(),
});

describe('AlertToastsComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('drops a toast once it has had its 45 seconds, with no new alerts', () => {
    const store = TestBed.inject(EmergencyStore);
    const fixture = TestBed.createComponent(AlertToastsComponent);
    fixture.detectChanges();
    const text = (): string => (fixture.nativeElement as HTMLElement).textContent;

    store.add([alert('a00001')]);
    fixture.detectChanges();
    expect(text()).toContain('7700');

    vi.advanceTimersByTime(50_000);
    fixture.detectChanges();
    expect(text()).not.toContain('7700');
  });

  it('stops ticking when the component goes away', () => {
    const store = TestBed.inject(EmergencyStore);
    const fixture = TestBed.createComponent(AlertToastsComponent);
    fixture.detectChanges();
    store.add([alert('a00002')]);
    // Other services keep their own timers; this one must go with the view.
    const before = vi.getTimerCount();
    fixture.destroy();
    expect(vi.getTimerCount()).toBeLessThan(before);
  });
});
