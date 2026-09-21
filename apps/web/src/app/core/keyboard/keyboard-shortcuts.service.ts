import { DestroyRef, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { FilterStore } from '../filters/filter.store';
import { MapUiStore } from '../state/map-ui.store';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Global shortcuts (SPEC § 5.4): `/` or ⌘K search, `f` filters, `Esc` close
 * the top-most thing (filters, then the selection).
 */
@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService {
  private readonly router = inject(Router);
  private readonly filters = inject(FilterStore);
  private readonly store = inject(MapUiStore);

  constructor() {
    const onKey = (e: KeyboardEvent): void => {
      this.handle(e);
    };
    document.addEventListener('keydown', onKey);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('keydown', onKey);
    });
  }

  /** Exposed for tests. */
  handle(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.filters.open()) this.filters.open.set(false);
      else if (this.store.selected() !== null) this.store.select(null);
      return;
    }
    const commandK = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey);
    if (commandK || (e.key === '/' && !isTyping(e.target))) {
      e.preventDefault();
      void this.router.navigate(['/search']);
      return;
    }
    if (e.key === 'f' && !isTyping(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      this.filters.open.update((o) => !o);
    }
  }
}
