import type { ElementRef } from '@angular/core';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { SearchResult } from '../core/api/api-types';
import { SearchService, type SearchKind } from '../core/search/search.service';
import { MapUiStore } from '../core/state/map-ui.store';
import { IconComponent } from '../ui/icon/icon.component';

interface Row {
  readonly key: string;
  readonly title: string;
  readonly sub: string;
  readonly result: SearchResult;
}

const KINDS: readonly { id: SearchKind; label: string }[] = [
  { id: 'flights', label: 'Flights' },
  { id: 'airports', label: 'Airports' },
  { id: 'airlines', label: 'Airlines' },
];

function toRow(r: SearchResult): Row {
  switch (r.kind) {
    case 'aircraft':
      return {
        key: `ac:${r.hex}`,
        title: r.callsign ?? r.registration ?? r.hex.toUpperCase(),
        sub: [r.registration, r.typeCode, r.hex.toUpperCase()].filter(Boolean).join(' · '),
        result: r,
      };
    case 'airport':
      return {
        key: `ap:${r.icao}`,
        title: `${r.icao}${r.iata === null ? '' : ` · ${r.iata}`}`,
        sub: [r.name, r.city].filter(Boolean).join(' · '),
        result: r,
      };
    case 'airline':
      return {
        key: `al:${r.icao}`,
        title: `${r.icao} · ${r.name}`,
        sub: r.country ?? '',
        result: r,
      };
  }
}

/** Search screen (design 1c): segmented kinds, live results, recent searches. */
@Component({
  selector: 'st-search-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  templateUrl: './search.page.html',
  styleUrl: './search.page.css',
})
export class SearchPage {
  private readonly search = inject(SearchService);
  private readonly router = inject(Router);
  private readonly store = inject(MapUiStore);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  protected readonly kinds = KINDS;
  protected readonly kind = signal<SearchKind>('flights');
  protected readonly query = signal('');
  protected readonly rows = signal<Row[]>([]);
  protected readonly loading = signal(false);
  protected readonly recent = this.search.recent;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;

  constructor() {
    const q = inject(ActivatedRoute).snapshot.queryParamMap.get('q');
    if (q !== null) this.setQuery(q);
    afterNextRender(() => {
      this.field().nativeElement.focus();
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.timer !== null) clearTimeout(this.timer);
      this.abort?.abort();
    });
  }

  protected onInput(e: Event): void {
    this.setQuery((e.target as HTMLInputElement).value);
  }

  protected setKind(k: SearchKind): void {
    this.kind.set(k);
    this.run();
  }

  protected clear(): void {
    this.setQuery('');
    this.field().nativeElement.focus();
  }

  protected open(row: Row): void {
    const r = row.result;
    this.search.remember({ label: row.title, query: this.query() || row.title, kind: this.kind() });
    if (r.kind === 'aircraft') {
      this.store.flyTo(r.lat, r.lon, Math.max(this.store.center().zoom, 8));
      this.store.select(r.hex);
      void this.router.navigate(['/']);
    } else if (r.kind === 'airport') {
      this.store.flyTo(r.lat, r.lon, 10);
      void this.router.navigate(['/']);
    } else {
      this.setKind('flights');
      this.setQuery(r.icao);
    }
  }

  protected reuse(query: string, kind: SearchKind): void {
    this.kind.set(kind);
    this.setQuery(query);
  }

  private setQuery(q: string): void {
    this.query.set(q);
    const el = this.field().nativeElement;
    if (el.value !== q) el.value = q;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.run();
    }, 200);
  }

  private run(): void {
    this.abort?.abort();
    const q = this.query();
    if (q.trim().length < 2) {
      this.rows.set([]);
      return;
    }
    const ctrl = new AbortController();
    this.abort = ctrl;
    this.loading.set(true);
    void this.search.search(q, this.kind(), ctrl.signal).then((results) => {
      if (ctrl.signal.aborted) return;
      this.rows.set(results.map(toRow));
      this.loading.set(false);
    });
  }
}
