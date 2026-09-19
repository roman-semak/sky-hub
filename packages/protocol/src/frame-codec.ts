import type { AircraftRecord } from './aircraft-record.js';
import type { Cluster } from './cluster.js';
import { FrameType } from './frame-type.js';
import type { IcaoId } from './hex-id.js';
import {
  CLUSTER_SIZE,
  HEADER_SIZE,
  MAX_COUNT,
  OFF,
  RECORD_SIZE,
  REMOVAL_SIZE,
  STALE_AGE,
} from './layout.js';
import { readRecord, writeRecord } from './record-codec.js';

export type Frame =
  | {
      readonly type: typeof FrameType.Snapshot | typeof FrameType.Delta;
      readonly timestamp: number;
      readonly records: AircraftRecord[];
    }
  | {
      readonly type: typeof FrameType.Removals;
      readonly timestamp: number;
      readonly removals: IcaoId[];
    }
  | {
      readonly type: typeof FrameType.Clusters;
      readonly timestamp: number;
      readonly clusters: Cluster[];
    };

function header(type: FrameType, timestampSec: number, count: number, itemSize: number): DataView {
  if (count > MAX_COUNT)
    throw new RangeError(`frame holds at most ${MAX_COUNT} items, got ${count}`);
  const view = new DataView(new ArrayBuffer(HEADER_SIZE + count * itemSize));
  view.setUint8(0, type);
  view.setUint32(1, timestampSec >>> 0);
  view.setUint16(5, count);
  return view;
}

export function encodeAircraftFrame(
  type: typeof FrameType.Snapshot | typeof FrameType.Delta,
  timestampSec: number,
  records: readonly AircraftRecord[],
): ArrayBuffer {
  const view = header(type, timestampSec, records.length, RECORD_SIZE);
  records.forEach((r, i) => {
    writeRecord(view, HEADER_SIZE + i * RECORD_SIZE, r);
  });
  return view.buffer as ArrayBuffer;
}

/** Pre-encoded record bytes plus the position time needed to patch `age`. */
export interface EncodedRecord {
  readonly bytes: Uint8Array;
  /** Unix ms of the position fix. */
  readonly posTime: number;
}

/**
 * Assembles an aircraft frame from records encoded once per tick and shared by
 * every client; only the `age` byte is patched per frame.
 */
export function assembleAircraftFrame(
  type: typeof FrameType.Snapshot | typeof FrameType.Delta,
  timestampSec: number,
  records: readonly EncodedRecord[],
): ArrayBuffer {
  const view = header(type, timestampSec, records.length, RECORD_SIZE);
  const out = new Uint8Array(view.buffer);
  const frameMs = timestampSec * 1000;
  records.forEach((r, i) => {
    const o = HEADER_SIZE + i * RECORD_SIZE;
    out.set(r.bytes, o);
    const age = Math.round((frameMs - r.posTime) / 1000);
    out[o + OFF.age] = Math.min(STALE_AGE, Math.max(0, age));
  });
  return view.buffer as ArrayBuffer;
}

export function encodeRemovals(timestampSec: number, ids: readonly IcaoId[]): ArrayBuffer {
  const view = header(FrameType.Removals, timestampSec, ids.length, REMOVAL_SIZE);
  ids.forEach((id, i) => {
    const o = HEADER_SIZE + i * REMOVAL_SIZE;
    view.setUint16(o, id.icao >>> 8);
    view.setUint8(o + 2, id.icao & 0xff);
    view.setUint8(o + 3, id.nonIcao ? 1 : 0);
  });
  return view.buffer as ArrayBuffer;
}

export function encodeClusters(timestampSec: number, clusters: readonly Cluster[]): ArrayBuffer {
  const view = header(FrameType.Clusters, timestampSec, clusters.length, CLUSTER_SIZE);
  clusters.forEach((c, i) => {
    const o = HEADER_SIZE + i * CLUSTER_SIZE;
    view.setInt32(o, Math.round(c.lat * 1e6));
    view.setInt32(o + 4, Math.round(c.lon * 1e6));
    view.setUint16(o + 8, Math.min(MAX_COUNT, c.count));
  });
  return view.buffer as ArrayBuffer;
}

const ITEM_SIZE: Readonly<Record<FrameType, number>> = {
  [FrameType.Snapshot]: RECORD_SIZE,
  [FrameType.Delta]: RECORD_SIZE,
  [FrameType.Removals]: REMOVAL_SIZE,
  [FrameType.Clusters]: CLUSTER_SIZE,
};

function isFrameType(v: number): v is FrameType {
  return v in ITEM_SIZE;
}

/** Decodes any frame. Throws `RangeError` on truncated or unknown frames. */
export function decodeFrame(buffer: ArrayBuffer | ArrayBufferView): Frame {
  const view =
    buffer instanceof ArrayBuffer
      ? new DataView(buffer)
      : new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.byteLength < HEADER_SIZE) throw new RangeError('frame shorter than header');
  const type = view.getUint8(0);
  if (!isFrameType(type)) throw new RangeError(`unknown frame type 0x${type.toString(16)}`);
  const timestamp = view.getUint32(1);
  const count = view.getUint16(5);
  const size = ITEM_SIZE[type];
  if (view.byteLength !== HEADER_SIZE + count * size) {
    throw new RangeError(`frame length ${view.byteLength} does not match count ${count}`);
  }
  switch (type) {
    case FrameType.Snapshot:
    case FrameType.Delta: {
      const records: AircraftRecord[] = new Array<AircraftRecord>(count);
      for (let i = 0; i < count; i++) records[i] = readRecord(view, HEADER_SIZE + i * size);
      return { type, timestamp, records };
    }
    case FrameType.Removals: {
      const removals: IcaoId[] = [];
      for (let i = 0; i < count; i++) {
        const o = HEADER_SIZE + i * size;
        removals.push({
          icao: (view.getUint16(o) << 8) | view.getUint8(o + 2),
          nonIcao: (view.getUint8(o + 3) & 1) === 1,
        });
      }
      return { type, timestamp, removals };
    }
    case FrameType.Clusters: {
      const clusters: Cluster[] = [];
      for (let i = 0; i < count; i++) {
        const o = HEADER_SIZE + i * size;
        clusters.push({
          lat: view.getInt32(o) / 1e6,
          lon: view.getInt32(o + 4) / 1e6,
          count: view.getUint16(o + 8),
        });
      }
      return { type, timestamp, clusters };
    }
  }
}
