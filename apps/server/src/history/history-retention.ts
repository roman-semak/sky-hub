import { readdir, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { HOUR_MS, hourOfPart } from './history-files.js';

/**
 * Deletes part files whose hour ended before `cutoff` (SPEC § 6.1 retention,
 * `HISTORY_RETENTION_HOURS`), then removes day directories left empty.
 *
 * @returns deleted file paths
 */
export async function purgeHistory(dir: string, cutoff: number): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir, { recursive: true });
  } catch {
    return [];
  }
  const deleted: string[] = [];
  for (const entry of entries) {
    const hour = hourOfPart(entry);
    if (hour === null || hour + HOUR_MS > cutoff) continue;
    const path = join(dir, entry);
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
