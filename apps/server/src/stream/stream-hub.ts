import type { CountryResolver } from '@skytrace/adsb-types';
import type { BBox } from '@skytrace/geo';
import { ClientMessageSchema, type ServerMessage } from '@skytrace/protocol';
import type { Logger } from '../logger.js';
import type { SpatialIndex } from '../state/spatial-index.js';
import { ClientSession, type WorldView } from './client-session.js';

/** The subset of a `ws` WebSocket the hub needs; keeps tests socket-free. */
export interface StreamSocket {
  readonly bufferedAmount: number;
  readonly readyState: number;
  send(data: ArrayBuffer | string): void;
  close(code?: number, reason?: string): void;
}

const OPEN = 1;

export interface StreamHubOptions {
  /** Skip a client's tick while this many bytes are still queued (backpressure). */
  readonly maxBufferedBytes: number;
  /** Control messages per client per second before disconnecting. */
  readonly maxMessagesPerSec: number;
  readonly pingIntervalMs: number;
}

export const DEFAULT_HUB_OPTIONS: StreamHubOptions = {
  maxBufferedBytes: 256 * 1024,
  maxMessagesPerSec: 20,
  pingIntervalMs: 5000,
};

interface Conn {
  readonly socket: StreamSocket;
  readonly session: ClientSession;
  msgWindowStart: number;
  msgCount: number;
  rttMs: number | null;
  skippedTicks: number;
  bytesSent: number;
}

export interface HubStats {
  readonly clients: number;
  readonly framesSent: number;
  readonly bytesSent: number;
  readonly skippedTicks: number;
  readonly lastFanoutMs: number;
}

/**
 * Owns all stream connections: parses control messages, fans index updates
 * out as per-client delta frames, and reports demand to the ingest scheduler.
 */
export class StreamHub {
  private readonly conns = new Set<Conn>();
  private index: SpatialIndex | null = null;
  private stats = { framesSent: 0, bytesSent: 0, skippedTicks: 0, lastFanoutMs: 0 };
  private pingTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly log: Logger,
    private readonly onDemand: (viewports: BBox[]) => void,
    private readonly opts: StreamHubOptions = DEFAULT_HUB_OPTIONS,
    private readonly now: () => number = Date.now,
    private readonly countryOf?: CountryResolver,
  ) {}

  start(): void {
    this.pingTimer ??= setInterval(() => {
      this.pingAll();
    }, this.opts.pingIntervalMs);
  }

  stop(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
    for (const c of this.conns) c.socket.close(1001, 'server shutting down');
    this.conns.clear();
  }

  get statistics(): HubStats {
    return { clients: this.conns.size, ...this.stats };
  }

  /** Registers a socket; returns handlers the transport must call. */
  connect(socket: StreamSocket): { onMessage: (data: string) => void; onClose: () => void } {
    const conn: Conn = {
      socket,
      session: new ClientSession(this.countryOf),
      msgWindowStart: this.now(),
      msgCount: 0,
      rttMs: null,
      skippedTicks: 0,
      bytesSent: 0,
    };
    this.conns.add(conn);
    this.sendJson(conn, { t: 'hello', version: 1, serverTime: this.now() });
    return {
      onMessage: (data) => {
        this.handleMessage(conn, data);
      },
      onClose: () => {
        this.conns.delete(conn);
        this.publishDemand();
      },
    };
  }

  /** Called once per spatial-index rebuild. */
  publish(index: SpatialIndex, removed: readonly string[]): void {
    const t0 = performance.now();
    const now = this.now();
    this.index = index;
    const view = { index, now };
    for (const conn of this.conns) {
      if (conn.session.isDue(now)) this.flush(conn, view, removed);
    }
    this.stats.lastFanoutMs = Math.round((performance.now() - t0) * 10) / 10;
  }

  private flush(conn: Conn, view: WorldView, removed: readonly string[]): void {
    if (conn.socket.readyState !== OPEN) return;
    if (conn.socket.bufferedAmount > this.opts.maxBufferedBytes) {
      // Slow consumer: skip; the next delta still covers everything missed.
      conn.skippedTicks++;
      this.stats.skippedTicks++;
      return;
    }
    const pending = conn.session.buildFrames(view, removed);
    for (const frame of pending.frames) {
      conn.socket.send(frame);
      conn.bytesSent += frame.byteLength;
      this.stats.bytesSent += frame.byteLength;
      this.stats.framesSent++;
    }
    pending.commit();
  }

  private handleMessage(conn: Conn, data: string): void {
    const now = this.now();
    if (now - conn.msgWindowStart >= 1000) {
      conn.msgWindowStart = now;
      conn.msgCount = 0;
    }
    if (++conn.msgCount > this.opts.maxMessagesPerSec) {
      conn.socket.close(1008, 'rate limit exceeded');
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      this.sendJson(conn, { t: 'error', message: 'invalid JSON' });
      return;
    }
    const parsed = ClientMessageSchema.safeParse(json);
    if (!parsed.success) {
      this.sendJson(conn, { t: 'error', message: 'invalid message' });
      return;
    }
    const msg = parsed.data;
    switch (msg.t) {
      case 'sub':
        conn.session.subscribe({ bbox: msg.bbox, zoom: msg.zoom });
        this.publishDemand();
        this.flushNow(conn);
        break;
      case 'filter':
        conn.session.setFilter(msg.f);
        this.flushNow(conn);
        break;
      case 'watch':
        if (!conn.session.watch(msg.hex))
          this.sendJson(conn, { t: 'error', message: 'too many watched aircraft' });
        else this.flushNow(conn);
        break;
      case 'unwatch':
        conn.session.unwatch(msg.hex);
        break;
      case 'pong':
        conn.rttMs = Math.max(0, now - msg.ts);
        break;
      case 'preview': {
        const count =
          this.index === null ? 0 : conn.session.countMatching({ index: this.index, now }, msg.f);
        this.sendJson(conn, { t: 'preview', id: msg.id, count });
        break;
      }
    }
  }

  private flushNow(conn: Conn): void {
    if (this.index === null) return;
    this.flush(conn, { index: this.index, now: this.now() }, []);
  }

  private publishDemand(): void {
    const viewports: BBox[] = [];
    for (const c of this.conns) {
      const sub = c.session.subscription;
      // Cluster-level zooms span continents; they must not pin the scheduler.
      if (sub !== null && sub.zoom >= 4) viewports.push(sub.bbox);
    }
    this.onDemand(viewports);
  }

  private pingAll(): void {
    const ts = this.now();
    for (const c of this.conns) {
      this.sendJson(c, { t: 'ping', ts });
      this.sendJson(c, { t: 'stats', rttMs: c.rttMs, inView: c.session.inView });
    }
  }

  private sendJson(conn: Conn, msg: ServerMessage): void {
    if (conn.socket.readyState !== OPEN) return;
    try {
      conn.socket.send(JSON.stringify(msg));
    } catch (err) {
      this.log.warn({ err }, 'send failed');
    }
  }
}
