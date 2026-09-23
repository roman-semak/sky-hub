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

  /**
   * One row per aircraft. An escalation (7600 → 7700) replaces the row and
   * counts as new, so the toast and the badge fire again — keeping two rows
   * for one hex would let `dismiss(hex)` clear the newer alert as well.
   */
  add(items: readonly EmergencyAlert[], now = Date.now()): SeenAlert[] {
    const current = new Map(this.alerts().map((a) => [a.hex, a]));
    const fresh: SeenAlert[] = [];
    for (const item of items) {
      if (current.get(item.hex)?.kind === item.kind) continue;
      fresh.push({ ...item, receivedAt: now, acknowledged: false });
    }
    if (fresh.length === 0) return [];
    const replaced = new Set(fresh.map((a) => a.hex));
    this.alerts.set(
      [...fresh, ...this.alerts().filter((a) => !replaced.has(a.hex))].slice(0, MAX_ALERTS),
    );
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
