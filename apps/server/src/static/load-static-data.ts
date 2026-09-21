import { readFile } from 'node:fs/promises';
import { zstdDecompressSync } from 'node:zlib';
import { StaticDatasetsSchema, StaticIndex } from '@skytrace/static-data';
import type { Logger } from '../logger.js';

/**
 * Loads `data/static/datasets.json.zst` (built by `pnpm data:refresh`).
 * Missing or corrupt data degrades features (no airport search, no airline
 * names) instead of preventing startup.
 */
export async function loadStaticData(path: string, log: Logger): Promise<StaticIndex | null> {
  try {
    const raw = await readFile(path);
    const parsed = StaticDatasetsSchema.safeParse(
      JSON.parse(zstdDecompressSync(raw).toString('utf8')),
    );
    if (!parsed.success) {
      log.warn(
        { path, error: parsed.error.message },
        'static datasets invalid, running without them',
      );
      return null;
    }
    const { airports, airlines, types, generatedAt } = parsed.data;
    log.info(
      { airports: airports.length, airlines: airlines.length, types: types.length, generatedAt },
      'static datasets loaded',
    );
    return new StaticIndex(parsed.data);
  } catch (err) {
    log.warn({ path, err: String(err) }, 'static datasets unavailable, run `pnpm data:refresh`');
    return null;
  }
}
