import { computed, Injectable, signal } from '@angular/core';

export interface FollowedFlight {
  readonly hex: string;
  readonly callsign: string | null;
  readonly addedAt: number;
}

const KEY = 'skytrace.following';
const MAX_FOLLOWED = 50;

function isFollowed(v: unknown): v is FollowedFlight {
  if (typeof v !== 'object' || v === null) return false;
  const f = v as Record<string, unknown>;
  return (
    typeof f['hex'] === 'string' &&
    (f['callsign'] === null || typeof f['callsign'] === 'string') &&
    typeof f['addedAt'] === 'number'
  );
}

/** Hand-rolled guard: keeps Zod out of the initial bundle for one storage key. */
function parseStored(raw: unknown): { flights: FollowedFlight[]; alerts: boolean } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const flights = r['flights'];
  const alerts = r['alerts'];
  if (!Array.isArray(flights) || flights.length > MAX_FOLLOWED || !flights.every(isFollowed))
    return null;
  if (typeof alerts !== 'boolean') return null;
  return { flights, alerts };
}

/** Followed flights and the alert preference, persisted locally (design 1d). */
@Injectable({ providedIn: 'root' })
export class FollowStore {
  readonly flights = signal<FollowedFlight[]>([]);
  readonly alerts = signal(true);
  readonly count = computed(() => this.flights().length);

  constructor() {
    try {
      const parsed = parseStored(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
      if (parsed !== null) {
        this.flights.set(parsed.flights);
        this.alerts.set(parsed.alerts);
      }
    } catch {
      // Corrupt storage: start empty.
    }
  }

  isFollowing(hex: string): boolean {
    return this.flights().some((f) => f.hex === hex);
  }

  toggle(hex: string, callsign: string | null): boolean {
    const exists = this.isFollowing(hex);
    this.flights.set(
      exists
        ? this.flights().filter((f) => f.hex !== hex)
        : [...this.flights(), { hex, callsign, addedAt: Date.now() }].slice(-MAX_FOLLOWED),
    );
    this.persist();
    return !exists;
  }

  setAlerts(on: boolean): void {
    this.alerts.set(on);
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ flights: this.flights(), alerts: this.alerts() }));
    } catch {
      // Private mode: following lasts for this session.
    }
  }
}
