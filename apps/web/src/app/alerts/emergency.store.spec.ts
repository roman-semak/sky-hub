import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { EmergencyAlert } from '@skytrace/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EmergencyNotifier, type Notifier } from './emergency-notifier.service';
import { EmergencyStore } from './emergency.store';

const alert = (
  hex: string,
  kind: EmergencyAlert['kind'] = 'general',
  squawk = '7700',
): EmergencyAlert => ({
  hex,
  callsign: 'TEST1',
  squawk,
  kind,
  lat: 38.7,
  lon: -9.1,
  military: false,
  at: 1_790_000_000_000,
});

describe('EmergencyStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('keeps one entry per aircraft and code, newest first', () => {
    const s = TestBed.inject(EmergencyStore);
    expect(s.add([alert('a00001')])).toHaveLength(1);
    expect(s.add([alert('a00001')])).toHaveLength(0);
    expect(s.add([alert('a00001', 'unlawful', '7500')])).toHaveLength(1);
    expect(s.alerts()[0]?.squawk).toBe('7500');
    expect(s.unread()).toBe(2);
  });

  it('acknowledges and dismisses', () => {
    const s = TestBed.inject(EmergencyStore);
    s.add([alert('a00001'), alert('a00002')]);
    s.acknowledge('a00001');
    expect(s.unread()).toBe(1);
    s.acknowledgeAll();
    expect(s.unread()).toBe(0);
    s.dismiss('a00001');
    expect(s.alerts()).toHaveLength(1);
  });

  it('persists the notification preference', () => {
    TestBed.inject(EmergencyStore).setNotify(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    expect(TestBed.inject(EmergencyStore).notify()).toBe(true);
  });
});

describe('EmergencyNotifier', () => {
  function setup(initial: NotificationPermission, answer: NotificationPermission = 'granted') {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const shown: string[] = [];
    // Like the browser: the prompt's answer becomes the new permission.
    let permission = initial;
    const notifier: Notifier = {
      get permission() {
        return permission;
      },
      request: async () => (permission = answer),
      show: (title, body) => shown.push(`${title}|${body}`),
    };
    const service = TestBed.inject(EmergencyNotifier);
    service.useNotifier(notifier);
    return { service, shown, store: TestBed.inject(EmergencyStore) };
  }

  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('asks for permission when enabled and then notifies', async () => {
    const { service, shown, store } = setup('default');
    expect(await service.enable()).toBe(true);
    expect(store.notify()).toBe(true);
    service.publish([alert('a00001')]);
    expect(shown[0]).toContain('7700');
    expect(shown[0]).toContain('general emergency');
  });

  it('stays quiet when denied, disabled or unavailable', async () => {
    const denied = setup('default', 'denied');
    expect(await denied.service.enable()).toBe(false);
    denied.service.publish([alert('a00001')]);
    expect(denied.shown).toEqual([]);
    TestBed.resetTestingModule();

    const granted = setup('granted');
    granted.service.publish([alert('a00002')]);
    expect(granted.shown).toEqual([]); // opt-in is off
    await granted.service.enable();
    granted.service.disable();
    granted.service.publish([alert('a00003')]);
    expect(granted.shown).toEqual([]);
    TestBed.resetTestingModule();

    const none = setup('granted');
    none.service.useNotifier(null);
    expect(none.service.available).toBe(false);
    expect(await none.service.enable()).toBe(false);
  });
});
