import type { CoverageCircle } from '@skytrace/geo';
import type { Logger } from '../logger.js';
import { SpatialIndex } from '../state/spatial-index.js';
import type { StateStore } from '../state/state-store.js';
import type { CoverageScheduler } from './coverage-scheduler.js';
import type { PooledProvider, ProviderPool } from './provider-pool.js';
import type { Provider, ProviderOutcome } from './provider.js';

export interface IngestWorkerOptions {
  /** How often the loop looks for idle providers, ms. */
  readonly tickMs: number;
  /** Spatial index rebuild period, ms (SPEC: 1 s). */
  readonly indexMs: number;
  /**
   * Aircraft not heard from for this long are dropped, ms. SPEC says 60 s, but
   * unwatched circles are only refreshed every ~2 min under free-API limits,
   * so the default is longer; see ADR-003.
   */
  readonly evictAfterMs: number;
}

export const DEFAULT_INGEST_OPTIONS: IngestWorkerOptions = {
  tickMs: 100,
  indexMs: 1000,
  evictAfterMs: 180_000,
};

export interface IngestStats {
  readonly startedAt: number;
  readonly fetches: number;
  readonly acceptedUpdates: number;
  readonly invalidEntries: number;
  readonly lastIndexBuildMs: number;
}

type Listener = (index: SpatialIndex, removed: readonly string[]) => void;

/**
 * Drives polling: on each tick hands the most urgent circle to every idle
 * provider, merges results into the store, and once per second evicts stale
 * aircraft and publishes a fresh {@link SpatialIndex} to listeners.
 */
export class IngestWorker {
  private tickTimer: NodeJS.Timeout | null = null;
  private indexTimer: NodeJS.Timeout | null = null;
  private readonly abort = new AbortController();
  private index = SpatialIndex.build([]);
  private readonly listeners = new Set<Listener>();
  private stats = {
    startedAt: 0,
    fetches: 0,
    acceptedUpdates: 0,
    invalidEntries: 0,
    lastIndexBuildMs: 0,
  };
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly pool: ProviderPool,
    private readonly scheduler: CoverageScheduler,
    private readonly store: StateStore,
    private readonly log: Logger,
    private readonly opts: IngestWorkerOptions = DEFAULT_INGEST_OPTIONS,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    if (this.tickTimer !== null) return;
    this.stats.startedAt = this.now();
    this.tickTimer = setInterval(() => {
      this.tick();
    }, this.opts.tickMs);
    this.indexTimer = setInterval(() => {
      this.rebuildIndex();
    }, this.opts.indexMs);
    this.tick();
  }

  async stop(): Promise<void> {
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
    if (this.indexTimer !== null) clearInterval(this.indexTimer);
    this.tickTimer = null;
    this.indexTimer = null;
    this.abort.abort();
    await Promise.allSettled([...this.pending]);
  }

  onIndex(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get currentIndex(): SpatialIndex {
    return this.index;
  }

  get statistics(): IngestStats {
    return { ...this.stats };
  }

  /** Dispatches work to every idle provider. Exposed for tests. */
  tick(): void {
    for (const fallback of [false, true]) {
      for (;;) {
        const now = this.now();
        const member = this.pool.acquire(now, fallback);
        if (member === null) break;
        const job = this.scheduler.next(now, fallback);
        if (job === null) break;
        member.health.begin(now);
        const p = this.safeFetch(member.provider, job.circle).then((outcome) => {
          const done = this.now();
          try {
            this.settle(member, job, outcome, now, done);
          } catch (err) {
            // Bookkeeping must happen even if the store or the index throws:
            // otherwise the provider stays "in flight" and its circle is
            // never rescheduled, and the rejection would take the process
            // down with it.
            this.log.error(
              { provider: member.provider.id, circle: job.circle.id, err },
              'ingest bookkeeping failed',
            );
            member.health.fail(done, 'error', String(err));
            this.scheduler.complete(job.circle.id, done, false);
          }
        });
        this.pending.add(p);
        void p.finally(() => {
          this.pending.delete(p);
        });
      }
    }
  }

  /** The bookkeeping half of a fetch: health, stats and scheduling. */
  private settle(
    member: PooledProvider,
    job: { circle: CoverageCircle },
    outcome: ProviderOutcome,
    now: number,
    done: number,
  ): void {
    if (outcome.kind === 'ok') {
      member.health.succeed(done, done - now);
      const accepted = this.store.upsertMany(outcome.aircraft);
      this.stats.fetches++;
      this.stats.acceptedUpdates += accepted;
      this.stats.invalidEntries += outcome.invalid;
      if (outcome.invalid > 0) {
        this.log.warn(
          { provider: member.provider.id, invalid: outcome.invalid },
          'skipped invalid aircraft',
        );
      }
      this.scheduler.complete(job.circle.id, done, true);
      return;
    }
    const msg = outcome.kind === 'rate-limited' ? `HTTP ${outcome.status}` : outcome.message;
    member.health.fail(done, outcome.kind, msg);
    this.scheduler.complete(job.circle.id, done, false);
    this.log.debug({ provider: member.provider.id, circle: job.circle.id, msg }, 'fetch failed');
  }

  /** Evicts stale aircraft and rebuilds the index. Exposed for tests. */
  rebuildIndex(): void {
    const t0 = performance.now();
    const removed = this.store.evictStale(this.now(), this.opts.evictAfterMs);
    this.index = SpatialIndex.build(this.store.values());
    this.stats.lastIndexBuildMs = Math.round((performance.now() - t0) * 10) / 10;
    for (const l of this.listeners) l(this.index, removed);
  }

  private async safeFetch(provider: Provider, circle: CoverageCircle): Promise<ProviderOutcome> {
    try {
      return await provider.fetchCircle(circle, this.abort.signal);
    } catch (err) {
      // Providers never throw by contract; this guard keeps a buggy one from
      // wedging its breaker in the in-flight state.
      this.log.error({ provider: provider.id, circle: circle.id, err }, 'provider threw');
      return { kind: 'error', status: null, message: String(err) };
    }
  }
}
