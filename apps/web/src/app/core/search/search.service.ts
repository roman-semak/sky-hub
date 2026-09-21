import { inject, Injectable, signal } from '@angular/core';
import type { SearchResult } from '../api/api-types';
import { FETCH_FN } from '../live/aircraft-meta.service';

export type SearchKind = 'flights' | 'airports' | 'airlines';

export interface RecentSearch {
  readonly label: string;
  readonly query: string;
  readonly kind: SearchKind;
}

const RECENT_KEY = 'skytrace.recent-searches';
const MAX_RECENT = 6;

/** `/api/search` plus a short list of recent searches (design 1c). */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly fetchFn = inject(FETCH_FN);
  readonly recent = signal<RecentSearch[]>(this.loadRecent());

  async search(q: string, kind: SearchKind, signal?: AbortSignal): Promise<SearchResult[]> {
    if (q.trim().length < 2) return [];
    const params = new URLSearchParams({ q: q.trim(), kind, limit: '20' });
    try {
      const res = await this.fetchFn(
        `/api/search?${params.toString()}`,
        signal === undefined ? {} : { signal },
      );
      if (!res.ok) return [];
      return ((await res.json()) as { results: SearchResult[] }).results;
    } catch {
      return [];
    }
  }

  remember(entry: RecentSearch): void {
    const next = [entry, ...this.recent().filter((r) => r.label !== entry.label)].slice(
      0,
      MAX_RECENT,
    );
    this.recent.set(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // Not persisted in private mode.
    }
  }

  private loadRecent(): RecentSearch[] {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
      return Array.isArray(raw)
        ? raw
            .filter(
              (r): r is RecentSearch =>
                typeof r === 'object' &&
                r !== null &&
                typeof (r as RecentSearch).label === 'string' &&
                typeof (r as RecentSearch).query === 'string',
            )
            .slice(0, MAX_RECENT)
        : [];
    } catch {
      return [];
    }
  }
}
