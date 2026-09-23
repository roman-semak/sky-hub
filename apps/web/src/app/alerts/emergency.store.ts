import { computed, Injectable, signal } from '@angular/core';
import type { EmergencyAlert } from '@skytrace/protocol';

export interface SeenAlert extends EmergencyAlert {
  /** Local ms when the client learned about it. */
  readonly receivedAt: number;
  readonly acknowledged: boolean;
}

/** Squawk codes, for the copy shown next to an alert. */
export const SQUAWK_MEANING: Readonly<Record<string, string>> = {
  '7500': 'unlawful interference',
  '7600': 'radio failure',
  '7700': 'general emergency',
};

const MAX_ALERTS = 30;
const NOTIFY_KEY = 'skytrace.alerts.notify';

/**
 * Emergency squawks pushed by the server (SPEC phase 8). Kept out of the
 * stream registry: alerts are global, the registry is viewport-scoped.
 */
@Injectable({ providedIn: 'root' })
export class EmergencyStore {
  readonly alerts = signal<SeenAlert[]>([]);
  readonly unread = computed(() => this.alerts().filter((a) => !a.acknowledged).length);
  /** Whether the user asked for system notifications. */
  readonly notify = signal(this.loadNotify());

  add(items: readonly EmergencyAlert[], now = Date.now()): SeenAlert[] {
    const fresh: SeenAlert[] = [];
    const byHex = new Map(this.alerts().map((a) => [`${a.hex}:${a.kind}`, a]));
    for (const item of items) {
      const key = `${item.hex}:${item.kind}`;
      if (byHex.has(key)) continue;
      const seen: SeenAlert = { ...item, receivedAt: now, acknowledged: false };
      byHex.set(key, seen);
      fresh.push(seen);
    }
    if (fresh.length === 0) return [];
    this.alerts.set([...fresh, ...this.alerts()].slice(0, MAX_ALERTS));
    return fresh;
  }

  acknowledge(hex: string): void {
    this.alerts.update((list) =>
      list.map((a) => (a.hex === hex ? { ...a, acknowledged: true } : a)),
    );
  }

  acknowledgeAll(): void {
    this.alerts.update((list) => list.map((a) => ({ ...a, acknowledged: true })));
  }

  dismiss(hex: string): void {
    this.alerts.update((list) => list.filter((a) => a.hex !== hex));
  }

  setNotify(on: boolean): void {
    this.notify.set(on);
    try {
      localStorage.setItem(NOTIFY_KEY, on ? '1' : '0');
    } catch {
      // Private mode: the choice lasts for this session.
    }
  }

  private loadNotify(): boolean {
    try {
      return localStorage.getItem(NOTIFY_KEY) === '1';
    } catch {
      return false;
    }
  }
}
