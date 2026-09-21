import { effect, Injectable, signal } from '@angular/core';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'skytrace.theme';

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'light' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Theme preference with `prefers-color-scheme` fallback (SPEC § 5.4). */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(readStored());
  private readonly systemDark = signal(matchMedia('(prefers-color-scheme: dark)').matches);
  readonly theme = signal<ResolvedTheme>('dark');

  constructor() {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      this.systemDark.set(e.matches);
    });
    effect(() => {
      const pref = this.preference();
      const resolved: ResolvedTheme =
        pref === 'system' ? (this.systemDark() ? 'dark' : 'light') : pref;
      this.theme.set(resolved);
      document.documentElement.dataset['theme'] = resolved;
      try {
        localStorage.setItem(STORAGE_KEY, pref);
      } catch {
        // Private mode: the preference simply does not persist.
      }
    });
  }

  toggle(): void {
    this.preference.set(this.theme() === 'dark' ? 'light' : 'dark');
  }
}
