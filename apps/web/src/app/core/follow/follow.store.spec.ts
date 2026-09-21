import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FollowStore } from './follow.store';

describe('FollowStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('toggles, persists and restores followed flights', () => {
    const store = TestBed.inject(FollowStore);
    expect(store.toggle('4951ab', 'TAP123')).toBe(true);
    expect(store.isFollowing('4951ab')).toBe(true);
    store.setAlerts(false);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const again = TestBed.inject(FollowStore);
    expect(again.count()).toBe(1);
    expect(again.alerts()).toBe(false);
    expect(again.toggle('4951ab', null)).toBe(false);
    expect(again.count()).toBe(0);
  });

  it('starts empty on corrupt storage', () => {
    localStorage.setItem('skytrace.following', '{bad');
    expect(TestBed.inject(FollowStore).count()).toBe(0);
  });
});
