import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilterStore } from '../filters/filter.store';
import { MapUiStore } from '../state/map-ui.store';
import { KeyboardShortcutsService } from './keyboard-shortcuts.service';

describe('KeyboardShortcutsService', () => {
  let service: KeyboardShortcutsService;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    service = TestBed.inject(KeyboardShortcutsService);
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.inject(Router).navigate = navigate;
  });
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('opens search on / and ⌘K', () => {
    service.handle(new KeyboardEvent('keydown', { key: '/' }));
    service.handle(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('toggles filters on f but not while typing', () => {
    const filters = TestBed.inject(FilterStore);
    service.handle(new KeyboardEvent('keydown', { key: 'f' }));
    expect(filters.open()).toBe(true);
    const input = document.createElement('input');
    const typing = new KeyboardEvent('keydown', { key: 'f' });
    Object.defineProperty(typing, 'target', { value: input });
    service.handle(typing);
    expect(filters.open()).toBe(true);
  });

  it('closes filters first, then the selection, on Escape', () => {
    const filters = TestBed.inject(FilterStore);
    const store = TestBed.inject(MapUiStore);
    filters.open.set(true);
    store.select('4951ab');
    service.handle(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(filters.open()).toBe(false);
    expect(store.selected()).toBe('4951ab');
    service.handle(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(store.selected()).toBeNull();
  });
});
