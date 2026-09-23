import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeFrame, FrameType } from '@skytrace/protocol';
import { describe, expect, it } from 'vitest';
import { fixFromRow, fixOf, hexOfKey, icaoKey } from '../src/history/history-codec.js';
import { hourOfPart, partPath } from '../src/history/history-files.js';
import { HistoryReader, thin } from '../src/history/history-reader.js';
import { purgeHistory } from '../src/history/history-retention.js';
import { encodePlayback, HistoryService, segment } from '../src/history/history-service.js';
import { encodeHistory, HistoryWriter } from '../src/history/history-writer.js';
import { TrackHistory } from '../src/history/track-history.js';
import { silentLogger } from '../src/logger.js';
import { makeAircraft } from './fixtures.js';

const H0 = Date.UTC(2026, 8, 21, 10, 0, 0);
const tmp = (): string => mkdtempSync(join(tmpdir(), 'skytrace-history-'));

describe('history codec and layout', () => {
  it('maps hex to a sortable INT32 key and back', () => {
    for (const hex of ['000000', '4951ab', 'ffffff', '~abcdef'])
      expect(hexOfKey(icaoKey(hex))).toBe(hex);
    expect(icaoKey('~000001')).toBeGreaterThan(icaoKey('ffffff'));
  });

  it('converts aircraft and decoded rows, rejecting broken rows', () => {
    const f = fixOf(makeAircraft({ onGround: true, altBaro: 0, posTime: H0 }));
    expect(f).toMatchObject({ ts: H0, hex: 'abcdef', alt: 0 });
    expect(
      fixFromRow({
        ts: BigInt(H0),
        icao24: 0x4951ab,
        lat: 1,
        lon: 2,
        alt: null,
        gs: 3,
        track: null,
        vr: 5,
      }),
    ).toEqual({
      ts: H0,
      hex: '4951ab',
      lat: 1,
      lon: 2,
      alt: null,
      gs: 3,
      track: null,
      vr: 5,
    });
    expect(fixFromRow({ ts: 'x', icao24: 1, lat: 1, lon: 2 })).toBeNull();
  });

  it('names part files by UTC hour and parses them back', () => {
    const p = partPath('/h', H0 + 5 * 60_000 + 7_000);
    expect(p).toBe(join('/h', '2026-09-21', '10-0507.parquet'));
    expect(hourOfPart('2026-09-21/10-0507.parquet')).toBe(H0);
    expect(hourOfPart('2026-09-21/10-0507.parquet.tmp')).toBeNull();
    expect(hourOfPart('notes.txt')).toBeNull();
  });
});

describe('HistoryWriter + HistoryReader', () => {
  it('round-trips fixes through Parquet and finds one aircraft via row-group stats', async () => {
    const dir = tmp();
    const writer = new HistoryWriter(
      { dir, flushMs: 1e9, maxBufferedRows: 1e9 },
      silentLogger,
      () => H0 + 60_000,
    );
    // 3 000 aircraft × 10 fixes → several row groups.
    for (let s = 0; s < 10; s++) {
      for (let i = 0; i < 3000; i++) {
        writer.append(
          makeAircraft({
            hex: (0x100000 + i).toString(16),
            posTime: H0 + s * 10_000,
            lat: 40 + i * 0.001,
            lon: -9 + s * 0.01,
          }),
        );
      }
    }
    expect(writer.pending('100005', H0, H0 + 1e6)).toHaveLength(10);
    await writer.flush();
    expect(writer.statistics).toMatchObject({ buffered: 0, files: 1, rows: 30_000 });
    const files = readdirSync(join(dir, '2026-09-21'));
    expect(files).toEqual(['10-0100.parquet']);

    const reader = new HistoryReader(dir);
    const track = await reader.readTrack('100005', H0, H0 + 3_600_000);
    expect(track).toHaveLength(10);
    expect(track[0]).toMatchObject({ hex: '100005', ts: H0 });
    expect(track.map((f) => f.ts)).toEqual([...track.map((f) => f.ts)].sort((a, b) => a - b));
    expect(await reader.readTrack('100005', H0 + 45_000, H0 + 3_600_000)).toHaveLength(5);
    expect(await reader.readTrack('ffffff', H0, H0 + 3_600_000)).toHaveLength(0);
    // Second read comes from the file cache.
    expect(await reader.readTrack('100005', H0, H0 + 3_600_000)).toHaveLength(10);

    const window = await reader.readWindow([-10, 40, -8, 40.05], H0, H0 + 3_600_000, 20_000);
    const hexes = new Set(window.map((f) => f.hex));
    expect(hexes.size).toBe(51);
    // Thinned to one fix per 20 s per aircraft.
    expect(window.filter((f) => f.hex === '100000')).toHaveLength(5);

    expect(await reader.listParts(H0 + 7_200_000, H0 + 9_000_000)).toEqual([]);
    expect(await new HistoryReader(join(dir, 'missing')).listParts(0, Infinity)).toEqual([]);
    reader.forget('x');
  });

  it('flushes on size, ignores empty flushes, survives write errors', async () => {
    const dir = tmp();
    const writer = new HistoryWriter(
      { dir, flushMs: 1e9, maxBufferedRows: 2 },
      silentLogger,
      () => H0,
    );
    await writer.flush();
    writer.append(makeAircraft());
    writer.append(makeAircraft({ posTime: H0 + 1 }));
    await writer.stop();
    expect(writer.statistics.files).toBe(1);

    const blocked = join(dir, 'blocked');
    writeFileSync(blocked, 'not a directory');
    const bad = new HistoryWriter(
      { dir: blocked, flushMs: 1e9, maxBufferedRows: 1e9 },
      silentLogger,
      () => H0,
    );
    bad.append(makeAircraft());
    await bad.flush();
    expect(bad.statistics).toMatchObject({ files: 0, buffered: 0 });
  });

  it('starts and stops its flush timer', async () => {
    const writer = new HistoryWriter(
      { dir: tmp(), flushMs: 10, maxBufferedRows: 1e9 },
      silentLogger,
    );
    writer.start();
    writer.start();
    writer.append(makeAircraft());
    await new Promise((r) => setTimeout(r, 40));
    expect(writer.statistics.files).toBe(1);
    await writer.stop();
  });
  it('drops the temp file when a flush fails, and keeps running', async () => {
    const dir = tmp();
    const at = H0 + 60_000;
    // A directory where the part file should go: the rename fails, the temp
    // file is already on disk — the same shape as a volume filling up.
    mkdirSync(partPath(dir, at), { recursive: true });
    const writer = new HistoryWriter(
      { dir, flushMs: 1e9, maxBufferedRows: 1e9 },
      silentLogger,
      () => at,
    );
    writer.append(makeAircraft());
    await writer.flush();

    expect(writer.statistics).toMatchObject({ buffered: 0, files: 0, rows: 0 });
    expect(readdirSync(join(dir, '2026-09-21')).some((f) => f.endsWith('.tmp'))).toBe(false);
    // The writer is still usable: the failure cost five minutes, not the run.
    writer.append(makeAircraft());
    expect(writer.statistics.buffered).toBe(1);
  });
});

describe('purgeHistory', () => {
  it('deletes hours older than the cutoff and empty day folders', async () => {
    const dir = tmp();
    const oldDay = join(dir, '2026-09-18');
    const newDay = join(dir, '2026-09-21');
    mkdirSync(oldDay, { recursive: true });
    mkdirSync(newDay, { recursive: true });
    const bytes = new Uint8Array(encodeHistory([fixOf(makeAircraft())]));
    writeFileSync(join(oldDay, '10-0500.parquet'), bytes);
    writeFileSync(join(newDay, '10-0500.parquet'), bytes);
    writeFileSync(join(dir, 'README'), 'keep');
    const deleted = await purgeHistory(dir, H0 - 3_600_000);
    expect(deleted).toHaveLength(1);
    expect(existsSync(oldDay)).toBe(false);
    expect(existsSync(join(newDay, '10-0500.parquet'))).toBe(true);
    expect(existsSync(join(dir, 'README'))).toBe(true);
    expect(await purgeHistory(join(dir, 'missing'), 0)).toEqual([]);
  });

  it('sweeps abandoned temp files but never one being written', async () => {
    const dir = tmp();
    const day = join(dir, '2026-09-21');
    mkdirSync(day, { recursive: true });
    const stale = join(day, '10-0500.parquet.tmp');
    const inFlight = join(day, '10-1000.parquet.tmp');
    writeFileSync(stale, 'half');
    writeFileSync(inFlight, 'half');
    const now = Date.now();
    utimesSync(stale, new Date(now - 30 * 60_000), new Date(now - 30 * 60_000));

    const deleted = await purgeHistory(dir, 0, now);
    expect(deleted).toEqual([stale]);
    expect(existsSync(inFlight)).toBe(true);
  });
});

describe('HistoryService', () => {
  it('merges stored, pending and recent points without duplicates', async () => {
    const dir = tmp();
    const writer = new HistoryWriter(
      { dir, flushMs: 1e9, maxBufferedRows: 1e9 },
      silentLogger,
      () => H0,
    );
    writer.append(makeAircraft({ posTime: H0 }));
    await writer.flush();
    writer.append(makeAircraft({ posTime: H0 + 20_000 }));
    const recent = new TrackHistory();
    recent.record(makeAircraft({ posTime: H0 + 20_000 }));
    recent.record(makeAircraft({ posTime: H0 + 40_000, lat: 38.9 }));
    const service = new HistoryService(new HistoryReader(dir), writer, recent, () => H0);
    const raw = await service.rawTrack('abcdef', H0 - 1, H0 + 60_000);
    expect(raw.map((p) => p.t)).toEqual([H0, H0 + 20_000, H0 + 40_000]);
    const simplified = await service.track('abcdef', H0 - 1, H0 + 60_000);
    expect(simplified.raw).toBe(3);
    // Cached for 60 s.
    recent.record(makeAircraft({ posTime: H0 + 60_000, lat: 39 }));
    expect((await service.track('abcdef', H0 - 1, H0 + 60_000)).raw).toBe(3);
  });

  it('encodes playback as length-prefixed delta frames grouped by second', async () => {
    const recent = new TrackHistory();
    const writer = new HistoryWriter(
      { dir: tmp(), flushMs: 1e9, maxBufferedRows: 1e9 },
      silentLogger,
    );
    for (const [hex, t] of [
      ['000001', H0],
      ['000002', H0 + 300],
      ['000001', H0 + 30_000],
    ] as const) {
      writer.append(makeAircraft({ hex, posTime: t, lat: 38.7 }));
    }
    const service = new HistoryService(null, writer, recent, () => H0);
    const bytes = await service.playback([-10, 38, -8, 39], H0 - 1, H0 + 60_000, 5_000);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const frames = [];
    for (let o = 0; o < bytes.byteLength;) {
      const len = view.getUint32(o);
      frames.push(decodeFrame(bytes.subarray(o + 4, o + 4 + len)));
      o += 4 + len;
    }
    expect(frames.map((f) => f.type)).toEqual([FrameType.Delta, FrameType.Delta]);
    expect(frames[0]?.type === FrameType.Delta && frames[0].records).toHaveLength(2);
    expect(frames[1]?.timestamp).toBe(Math.floor((H0 + 30_000) / 1000));
    expect(encodePlayback([])).toHaveLength(0);
  });

  it('splits flights at long gaps, newest first', () => {
    const p = (t: number, alt: number | null) => ({
      t,
      lat: 1,
      lon: 2,
      alt,
      gs: null,
      track: null,
      vr: null,
    });
    const flights = segment([p(0, 1000), p(60_000, 30000), p(3_600_000, null), p(3_660_000, 5000)]);
    expect(flights).toHaveLength(2);
    expect(flights[0]).toMatchObject({ start: 3_600_000, points: 2, maxAlt: 5000 });
    expect(flights[1]).toMatchObject({ start: 0, end: 60_000, maxAlt: 30000 });
    expect(segment([p(0, null)])[0]?.maxAlt).toBeNull();
    expect(segment([])).toEqual([]);
  });

  it('thin keeps the first fix per aircraft per bucket', () => {
    const f = (hex: string, ts: number) => ({ ...fixOf(makeAircraft({ hex, posTime: ts })) });
    expect(
      thin([f('a00001', 0), f('a00001', 5_000), f('a00001', 25_000), f('a00002', 1)], 20_000),
    ).toHaveLength(3);
    expect(thin([f('a00001', 0), f('a00001', 1)], 0)).toHaveLength(2);
  });
});
