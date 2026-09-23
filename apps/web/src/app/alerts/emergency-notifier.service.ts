import { DestroyRef, effect, inject, Injectable } from '@angular/core';
import type { EmergencyAlert } from '@skytrace/protocol';
import { EmergencyStore, SQUAWK_MEANING } from './emergency.store';

/** Wraps the Notification API so tests can stub it. */
export interface Notifier {
  readonly permission: NotificationPermission;
  request(): Promise<NotificationPermission>;
  show(title: string, body: string, tag: string): void;
}

const browserNotifier = (): Notifier | null => {
  if (!('Notification' in globalThis)) return null;
  return {
    get permission() {
      return Notification.permission;
    },
    request: () => Notification.requestPermission(),
    show: (title, body, tag) => {
      new Notification(title, { body, tag, icon: 'icons/icon-192x192.png' });
    },
  };
};

/**
 * Raises a system notification for each new emergency squawk when the user
 * has opted in (SPEC phase 8). The in-app toast works regardless.
 */
@Injectable({ providedIn: 'root' })
export class EmergencyNotifier {
  private readonly store = inject(EmergencyStore);
  private notifier: Notifier | null = browserNotifier();

  constructor() {
    effect(() => {
      if (this.store.notify()) void this.ensurePermission();
    });
    inject(DestroyRef).onDestroy(() => {
      this.notifier = null;
    });
  }

  /** Test seam. */
  useNotifier(notifier: Notifier | null): void {
    this.notifier = notifier;
  }

  get available(): boolean {
    return this.notifier !== null;
  }

  async enable(): Promise<boolean> {
    const granted = await this.ensurePermission();
    this.store.setNotify(granted);
    return granted;
  }

  disable(): void {
    this.store.setNotify(false);
  }

  publish(alerts: readonly EmergencyAlert[]): void {
    const n = this.notifier;
    if (n === null || !this.store.notify() || n.permission !== 'granted') return;
    for (const a of alerts) {
      const meaning = a.squawk === null ? a.kind : (SQUAWK_MEANING[a.squawk] ?? a.kind);
      n.show(
        $localize`:@@alert.title:Emergency squawk ${a.squawk ?? '—'}:squawk:`,
        $localize`:@@alert.body:${a.callsign ?? a.hex.toUpperCase()}:flight: · ${meaning}:meaning:`,
        a.hex,
      );
    }
  }

  private async ensurePermission(): Promise<boolean> {
    const n = this.notifier;
    if (n === null) return false;
    if (n.permission === 'granted') return true;
    if (n.permission === 'denied') return false;
    return (await n.request()) === 'granted';
  }
}
