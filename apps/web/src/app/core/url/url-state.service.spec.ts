import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapUiStore } from '../state/map-ui.store';
import { UrlStateService } from './url-state.service';

describe('UrlStateService', () => {
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

  it('restores the store from a query string', () => {
    TestBed.inject(UrlStateService).restore('?lat=38.7&lon=-9.1&z=9&sel=4951ab');
    const store = TestBed.inject(MapUiStore);
    expect(store.center()).toEqual({ lat: 38.7, lon: -9.1, zoom: 9 });
    expect(store.selected()).toBe('4951ab');
  });

  it('writes the URL only while the map route is active', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.fn().mockResolvedValue(true);
    TestBed.inject(UrlStateService);
    router.navigate = navigate;
    const store = TestBed.inject(MapUiStore);

    Object.defineProperty(router, 'url', { configurable: true, get: () => '/search?q=tap' });
    store.select('4951ab');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(300);
    expect(navigate).not.toHaveBeenCalled();

    Object.defineProperty(router, 'url', { configurable: true, get: () => '/?lat=1' });
    store.select('abcdef');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(300);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]?.[1]).toMatchObject({
      queryParams: { sel: 'abcdef' },
      replaceUrl: true,
    });
  });
});
