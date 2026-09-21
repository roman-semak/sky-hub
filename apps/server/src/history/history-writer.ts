import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import type { Aircraft } from '@skytrace/adsb-types';
import { parquetWriteBuffer } from 'hyparquet-writer';
import type { Logger } from '../logger.js';
import { partPath } from './history-files.js';
import { fixOf, icaoKey, type HistoryFix } from './history-codec.js';

export interface HistoryWriterOptions {
  readonly dir: string;
  /** SPEC § 6.1: flush every 5 minutes. */
  readonly flushMs: number;
  /** Safety valve: flush early if the buffer grows past this many rows. */
  readonly maxBufferedRows: number;
}

export const ZSTD_COMPRESSORS = {
  ZSTD: (bytes: Uint8Array): Uint8Array => new Uint8Array(zstdCompressSync(bytes)),
};

/** Row groups of this size keep per-aircraft reads to a few groups (rows are sorted by icao24). */
const ROW_GROUP_ROWS = 20_000;

/** Encodes fixes as a zstd Parquet file sorted by `(icao24, ts)`. */
export function encodeHistory(fixes: readonly HistoryFix[]): ArrayBuffer {
  const rows = fixes
    .map((f) => ({ f, key: icaoKey(f.hex) }))
    .sort((a, b) => a.key - b.key || a.f.ts - b.f.ts);
  return parquetWriteBuffer({
    codec: 'ZSTD',
    compressors: ZSTD_COMPRESSORS,
    rowGroupSize: ROW_GROUP_ROWS,
    columnData: [
      {
        name: 'ts',
        data: rows.map((r) => BigInt(Math.round(r.f.ts))),
        type: 'INT64',
        nullable: false,
      },
      { name: 'icao24', data: rows.map((r) => r.key), type: 'INT32', nullable: false },
      { name: 'lat', data: rows.map((r) => r.f.lat), type: 'DOUBLE', nullable: false },
      { name: 'lon', data: rows.map((r) => r.f.lon), type: 'DOUBLE', nullable: false },
      {
        name: 'alt',
        data: rows.map((r) => (r.f.alt === null ? null : Math.round(r.f.alt))),
        type: 'INT32',
      },
      { name: 'gs', data: rows.map((r) => r.f.gs), type: 'FLOAT' },
      { name: 'track', data: rows.map((r) => r.f.track), type: 'FLOAT' },
      {
        name: 'vr',
        data: rows.map((r) => (r.f.vr === null ? null : Math.round(r.f.vr))),
        type: 'INT32',
      },
    ],
  });
}

/**
 * Buffers every accepted position fix and periodically writes it to a new
 * Parquet part file. Writes go to a temp name and are renamed, so readers
 * never see a half-written file.
 */
export class HistoryWriter {
  private buffer: HistoryFix[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;
  private written = { files: 0, rows: 0, bytes: 0 };

  constructor(
    private readonly opts: HistoryWriterOptions,
    private readonly log: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  append(ac: Aircraft): void {
    this.buffer.push(fixOf(ac));
    if (this.buffer.length >= this.opts.maxBufferedRows) void this.flush();
  }

  /** Buffered, not yet flushed fixes of one aircraft (so reads see the last minutes too). */
  pending(hex: string, from: number, to: number): HistoryFix[] {
    return this.buffer.filter((f) => f.hex === hex && f.ts >= from && f.ts <= to);
  }

  pendingInWindow(from: number, to: number): readonly HistoryFix[] {
    return this.buffer.filter((f) => f.ts >= from && f.ts <= to);
  }

  start(): void {
    this.timer ??= setInterval(() => {
      void this.flush();
    }, this.opts.flushMs);
  }

  async stop(): Promise<void> {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }

  get statistics(): { buffered: number; files: number; rows: number; bytes: number } {
    return { buffered: this.buffer.length, ...this.written };
  }

  async flush(): Promise<void> {
    if (this.flushing !== null) return this.flushing;
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    this.flushing = this.write(batch).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async write(batch: readonly HistoryFix[]): Promise<void> {
    const path = partPath(this.opts.dir, this.now());
    try {
      const bytes = encodeHistory(batch);
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.tmp`;
      await writeFile(tmp, new Uint8Array(bytes));
      await rename(tmp, path);
      this.written.files++;
      this.written.rows += batch.length;
      this.written.bytes += bytes.byteLength;
      this.log.debug({ path, rows: batch.length, bytes: bytes.byteLength }, 'history flushed');
    } catch (err) {
      // Losing five minutes of history beats crashing the ingest.
      this.log.error({ path, rows: batch.length, err: String(err) }, 'history flush failed');
    }
  }
}
