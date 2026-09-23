import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { EmergencyAlert } from '@skytrace/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EmergencyNotifier, type Notifier } from './emergency-notifier.service';
import { EmergencyStore } from './emergency.store';

const ALERT: EmergencyAlert = {
  hex: 'a00001',
  callsign: 'RSQ1',
  squawk: '7700',
  kind: 'general',
  lat: 40,
  lon: -8,
  military: false,
  at: Date.now(),
};

const notifier = (show: Notifier['show']): Notifier => ({
  permission: 'granted',
  request: async () => 'granted',
  show,
});

describe('EmergencyNotifier', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows one notification per alert once enabled', () => {
    const shown: string[] = [];
    const service = TestBed.inject(EmergencyNotifier);
    service.useNotifier(notifier((title) => shown.push(title)));
    TestBed.inject(EmergencyStore).setNotify(true);

    service.publish([ALERT]);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain('7700');
  });

  it('stays quiet until the user opts in', () => {
    const shown: string[] = [];
    const service = TestBed.inject(EmergencyNotifier);
    service.useNotifier(notifier((title) => shown.push(title)));

    service.publish([ALERT]);
    expect(shown).toEqual([]);
  });

  it('survives a browser that refuses to construct notifications', () => {
    const service = TestBed.inject(EmergencyNotifier);
    service.useNotifier(
      notifier(() => {
        // Android Chrome: only the service worker may notify.
        throw new TypeError('Illegal constructor');
      }),
    );
    TestBed.inject(EmergencyStore).setNotify(true);

    expect(() => {
      service.publish([ALERT]);
    }).not.toThrow();
    // It gives up rather than throwing again on the next alert.
    expect(service.available).toBe(false);
  });
});
