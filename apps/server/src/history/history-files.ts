import { join } from 'node:path';

/**
 * Layout (SPEC § 6.1, adapted in ADR-007): one immutable part file per flush,
 * `<dir>/YYYY-MM-DD/HH-mmss.parquet`, all times UTC. Parquet cannot be
 * appended to, so an hour consists of up to twelve 5-minute parts.
 */
export function partPath(dir: string, flushedAt: number): string {
  const d = new Date(flushedAt);
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return join(
    dir,
    day,
    `${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}.parquet`,
  );
}

/** Start of the hour a part file belongs to, from its relative path; `null` if not ours. */
export function hourOfPart(relative: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[/\\](\d{2})-\d{4}\.parquet$/.exec(relative);
  if (m === null) return null;
  const [, y, mo, d, h] = m;
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h));
  return Number.isFinite(t) ? t : null;
}

export const HOUR_MS = 3_600_000;
