import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { bboxContains, type BBox } from '@skytrace/geo';
import { parquetMetadata, parquetReadObjects, type FileMetaData } from 'hyparquet';
import { fixFromRow, icaoKey, type HistoryFix } from './history-codec.js';
import { HOUR_MS, hourOfPart } from './history-files.js';

const DECOMPRESSORS = {
  ZSTD: (input: Uint8Array): Uint8Array => new Uint8Array(zstdDecompressSync(input)),
};

interface RowGroupSpan {
  readonly start: number;
  readonly end: number;
  readonly minKey: number;
  readonly maxKey: number;
  readonly minTs: number;
  readonly maxTs: number;
}

interface PartFile {
  readonly path: string;
  readonly hour: number;
}

const asNumber = (v: unknown, fallback: number): number =>
  typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : fallback;

function spansOf(md: FileMetaData): RowGroupSpan[] {
  let start = 0;
  return md.row_groups.map((rg) => {
    const rows = Number(rg.num_rows);
    const stats = (i: number) => rg.columns[i]?.meta_data?.statistics;
    const span: RowGroupSpan = {
      start,
      end: start + rows,
      minTs: asNumber(stats(0)?.min_value, -Infinity),
      maxTs: asNumber(stats(0)?.max_value, Infinity),
      minKey: asNumber(stats(1)?.min_value, -Infinity),
      maxKey: asNumber(stats(1)?.max_value, Infinity),
    };
    start += rows;
    return span;
  });
}

/**
 * Reads history part files. Part files are immutable, so their bytes and
 * metadata are cached (bounded) — repeated track requests hit memory.
 */
export class HistoryReader {
  private readonly cache = new Map<string, { buffer: ArrayBuffer; spans: RowGroupSpan[] }>();

  constructor(
    private readonly dir: string,
    private readonly maxCachedFiles = 48,
  ) {}

  async listParts(from: number, to: number): Promise<PartFile[]> {
    let entries: string[];
    try {
      entries = await readdir(this.dir, { recursive: true });
    } catch {
      return [];
    }
    const parts: PartFile[] = [];
    for (const entry of entries) {
      const hour = hourOfPart(relative('.', entry));
      if (hour === null) continue;
      if (hour + HOUR_MS < from || hour > to) continue;
      parts.push({ path: join(this.dir, entry), hour });
    }
    return parts.sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Every stored fix of one aircraft in `[from, to]`, oldest first. */
  async readTrack(hex: string, from: number, to: number): Promise<HistoryFix[]> {
    const key = icaoKey(hex);
    const out: HistoryFix[] = [];
    for (const part of await this.listParts(from, to)) {
      const file = await this.open(part.path);
      for (const span of file.spans) {
        if (key < span.minKey || key > span.maxKey || span.maxTs < from || span.minTs > to)
          continue;
        for (const fix of await this.readRows(file.buffer, span)) {
          if (fix.hex === hex && fix.ts >= from && fix.ts <= to) out.push(fix);
        }
      }
    }
    return out.sort((a, b) => a.ts - b.ts);
  }

  /**
   * Fixes inside a bbox and time window, thinned to at most one per aircraft
   * per `spacingMs` — the playback payload (SPEC § 5.3 screen 6).
   */
  async readWindow(bbox: BBox, from: number, to: number, spacingMs: number): Promise<HistoryFix[]> {
    const out: HistoryFix[] = [];
    for (const part of await this.listParts(from, to)) {
      const file = await this.open(part.path);
      for (const span of file.spans) {
        if (span.maxTs < from || span.minTs > to) continue;
        for (const fix of await this.readRows(file.buffer, span)) {
          if (fix.ts >= from && fix.ts <= to && bboxContains(bbox, fix.lat, fix.lon)) out.push(fix);
        }
      }
    }
    return thin(out, spacingMs);
  }

  private async readRows(buffer: ArrayBuffer, span: RowGroupSpan): Promise<HistoryFix[]> {
    const rows = await parquetReadObjects({
      file: buffer,
      rowStart: span.start,
      rowEnd: span.end,
      compressors: DECOMPRESSORS,
    });
    const out: HistoryFix[] = [];
    for (const row of rows) {
      const fix = fixFromRow(row as Record<string, unknown>);
      if (fix !== null) out.push(fix);
    }
    return out;
  }

  private async open(path: string): Promise<{ buffer: ArrayBuffer; spans: RowGroupSpan[] }> {
    const cached = this.cache.get(path);
    if (cached !== undefined) return cached;
    const bytes = await readFile(path);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const entry = { buffer, spans: spansOf(parquetMetadata(buffer)) };
    if (this.cache.size >= this.maxCachedFiles) {
      const oldest = this.cache.keys().next();
      if (oldest.done !== true) this.cache.delete(oldest.value);
    }
    this.cache.set(path, entry);
    return entry;
  }

  forget(path: string): void {
    this.cache.delete(path);
  }
}

/** Keeps the first fix per aircraft in each `spacingMs` bucket, sorted by time. */
export function thin(fixes: readonly HistoryFix[], spacingMs: number): HistoryFix[] {
  const sorted = [...fixes].sort((a, b) => a.ts - b.ts);
  if (spacingMs <= 0) return sorted;
  const last = new Map<string, number>();
  const out: HistoryFix[] = [];
  for (const f of sorted) {
    const prev = last.get(f.hex);
    if (prev !== undefined && f.ts - prev < spacingMs) continue;
    last.set(f.hex, f.ts);
    out.push(f);
  }
  return out;
}
