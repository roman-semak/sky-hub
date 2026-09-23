import { readdir, rm, rmdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { HOUR_MS, hourOfPart } from './history-files.js';

/**
 * A flush that dies mid-write (a full volume, a killed process) leaves a
 * `.tmp` file no reader will ever open. Anything older than this is rubbish;
 * a flush in flight is seconds old, never minutes.
 */
const STALE_TMP_MS = 15 * 60_000;

/**
 * Deletes part files whose hour ended before `cutoff` (SPEC § 6.1 retention,
 * `HISTORY_RETENTION_HOURS`) plus abandoned temp files, then removes day
 * directories left empty.
 *
 * @returns deleted file paths
 */
export async function purgeHistory(
  dir: string,
  cutoff: number,
  now = Date.now(),
): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir, { recursive: true });
  } catch {
    return [];
  }
  const deleted: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    if (entry.endsWith('.parquet.tmp')) {
      const age = await stat(path).then(
        (s) => now - s.mtimeMs,
        () => 0,
      );
      if (age > STALE_TMP_MS) {
        await rm(path, { force: true });
        deleted.push(path);
      }
      continue;
    }
    const hour = hourOfPart(entry);
    if (hour === null || hour + HOUR_MS > cutoff) continue;
    await rm(path, { force: true });
    deleted.push(path);
  }
  for (const day of await readdir(dir).catch(() => [])) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const remaining = await readdir(join(dir, day)).catch(() => ['?']);
    if (remaining.length === 0) await rmdir(join(dir, day)).catch(() => undefined);
  }
  return deleted;
}
