import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../src/logger.js';
import { loadStaticData } from '../src/static/load-static-data.js';

const dir = mkdtempSync(join(tmpdir(), 'skytrace-static-'));

describe('loadStaticData', () => {
  it('loads a zstd dataset', async () => {
    const path = join(dir, 'ok.json.zst');
    writeFileSync(
      path,
      zstdCompressSync(
        Buffer.from(
          JSON.stringify({ version: 1, generatedAt: 'now', airports: [], airlines: [], types: [] }),
        ),
      ),
    );
    expect(await loadStaticData(path, silentLogger)).not.toBeNull();
  });

  it('degrades to null on missing or invalid files', async () => {
    expect(await loadStaticData(join(dir, 'missing.zst'), silentLogger)).toBeNull();
    const bad = join(dir, 'bad.json.zst');
    writeFileSync(bad, zstdCompressSync(Buffer.from(JSON.stringify({ version: 2 }))));
    expect(await loadStaticData(bad, silentLogger)).toBeNull();
  });

  it('loads the real committed dataset', async () => {
    const idx = await loadStaticData(
      join(import.meta.dirname, '../../../data/static/datasets.json.zst'),
      silentLogger,
    );
    expect(idx?.airport('LPPT')?.iata).toBe('LIS');
    expect(idx?.airline('TAP')).not.toBeNull();
    expect(idx?.aircraftType('A20N')).not.toBeNull();
  });
});
