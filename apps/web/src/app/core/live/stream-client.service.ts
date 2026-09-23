import { DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import type { FilterSpec } from '@skytrace/adsb-types';
import type { BBox } from '@skytrace/geo';
import { decodeFrame, type ClientMessage, type ServerMessage } from '@skytrace/protocol';
import { EmergencyNotifier } from '../../alerts/emergency-notifier.service';
import { EmergencyStore } from '../../alerts/emergency.store';
import { apiOrigin, streamUrl } from '../config/api-origin';
import { backoffDelay } from './backoff';
import { LiveRegistry } from './live-registry';
import { SyntheticFeed } from './synthetic-feed';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

/** Minimal socket surface, so tests can inject a fake. */
export interface SocketLike {
  binaryType: BinaryType;
  readonly readyState: number;
  onopen: ((ev: Event) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onmessage: ((ev: MessageEvent<ArrayBuffer | string>) => void) | null;
  onerror: ((ev: Event) => void) | null;
  send(data: string): void;
  close(): void;
}

export const SOCKET_FACTORY = new InjectionToken<(url: string) => SocketLike>('SOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => (url) => new WebSocket(url),
});

export const STREAM_URL = new InjectionToken<string>('STREAM_URL', {
  providedIn: 'root',
  factory: () => streamUrl(apiOrigin(), globalThis.location),
});

const OPEN = 1;

/**
 * Owns the `/stream` WebSocket: reconnects with backoff, keeps the viewport
 * subscription alive across reconnects, decodes binary frames into the
 * {@link LiveRegistry} and exposes connection health as signals.
 */
@Injectable({ providedIn: 'root' })
export class StreamClient {
  readonly registry = new LiveRegistry();
  readonly connection = signal<ConnectionState>('connecting');
  readonly rttMs = signal<number | null>(null);
  readonly bytesPerSec = signal(0);
  /** Local ms of the last binary frame, drives the "data stale" banner. */
  readonly lastFrameAt = signal<number | null>(null);
  readonly aircraftCount = signal(0);

  private readonly emergencies = inject(EmergencyStore);
  private readonly notifier = inject(EmergencyNotifier);
  private readonly createSocket = inject(SOCKET_FACTORY);
  private readonly url = inject(STREAM_URL);
  private socket: SocketLike | null = null;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private synthetic: ReturnType<typeof setInterval> | null = null;
  private sub: { bbox: BBox; zoom: number } | null = null;
  private filter: FilterSpec = {};
  private readonly watched = new Set<string>();
  private bytesWindow = 0;
  private stopped = false;
  private previewSeq = 0;
  private readonly previews = new Map<number, (count: number) => void>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stop();
    });
  }

  start(): void {
    this.stopped = false;
    this.statsTimer ??= setInterval(() => {
      this.bytesPerSec.set(this.bytesWindow);
      this.bytesWindow = 0;
      this.registry.prune(Date.now());
      this.aircraftCount.set(this.registry.aircraft.size);
    }, 1000);
    this.open();
  }

  /** Replaces the WebSocket with a local generator (benchmarks and demos). */
  startSynthetic(count: number, lat: number, lon: number): void {
    this.stop();
    this.stopped = false;
    const feed = new SyntheticFeed(count, lat, lon);
    const pump = (): void => {
      const now = Date.now();
      this.registry.apply(feed.tick(now, 1), now);
      this.lastFrameAt.set(now);
      this.aircraftCount.set(this.registry.aircraft.size);
    };
    pump();
    this.synthetic = setInterval(pump, 1000);
    this.connection.set('live');
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    if (this.statsTimer !== null) clearInterval(this.statsTimer);
    if (this.synthetic !== null) clearInterval(this.synthetic);
    this.reconnectTimer = null;
    this.statsTimer = null;
    this.synthetic = null;
    const s = this.socket;
    this.socket = null;
    s?.close();
  }

  subscribe(bbox: BBox, zoom: number): void {
    this.sub = { bbox, zoom };
    this.send({ t: 'sub', bbox: [...bbox], zoom });
  }

  setFilter(f: FilterSpec): void {
    this.filter = f;
    this.send({ t: 'filter', f });
  }

  /**
   * Asks the server how many aircraft in the viewport a filter would show.
   * Resolves to 0 when disconnected or when no answer arrives within 3 s.
   */
  preview(f: FilterSpec): Promise<number> {
    const id = ++this.previewSeq;
    if (this.socket?.readyState !== OPEN) return Promise.resolve(0);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.previews.delete(id);
        resolve(0);
      }, 3000);
      this.previews.set(id, (count) => {
        clearTimeout(timer);
        resolve(count);
      });
      this.send({ t: 'preview', f, id });
    });
  }

  watch(hex: string): void {
    this.watched.add(hex);
    this.send({ t: 'watch', hex });
  }

  unwatch(hex: string): void {
    this.watched.delete(hex);
    this.send({ t: 'unwatch', hex });
  }

  private open(): void {
    if (this.stopped) return;
    this.connection.set(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const s = this.createSocket(this.url);
    s.binaryType = 'arraybuffer';
    this.socket = s;
    s.onopen = () => {
      this.attempt = 0;
      this.connection.set('live');
      // Restore everything the server forgot with the old connection.
      if (this.sub !== null) this.send({ t: 'sub', bbox: [...this.sub.bbox], zoom: this.sub.zoom });
      if (Object.keys(this.filter).length > 0) this.send({ t: 'filter', f: this.filter });
      for (const hex of this.watched) this.send({ t: 'watch', hex });
    };
    s.onmessage = (ev) => {
      this.handle(ev.data);
    };
    s.onclose = () => {
      if (this.socket !== s) return;
      this.socket = null;
      this.scheduleReconnect();
    };
    s.onerror = () => {
      // `close` follows `error`; reconnect is handled there.
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    this.connection.set(offline ? 'offline' : 'reconnecting');
    const delay = backoffDelay(this.attempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private handle(data: ArrayBuffer | string): void {
    const now = Date.now();
    if (typeof data !== 'string') {
      this.bytesWindow += data.byteLength;
      try {
        this.registry.apply(decodeFrame(data), now);
        this.lastFrameAt.set(now);
      } catch {
        // A corrupt frame is dropped; the next snapshot/delta repairs state.
      }
      return;
    }
    this.bytesWindow += data.length;
    let msg: ServerMessage;
    try {
      msg = JSON.parse(data) as ServerMessage;
    } catch {
      return;
    }
    switch (msg.t) {
      case 'hello':
        this.registry.syncClock(msg.serverTime, now);
        break;
      case 'ping':
        this.send({ t: 'pong', ts: msg.ts });
        break;
      case 'stats':
        this.rttMs.set(msg.rttMs);
        break;
      case 'preview': {
        const done = this.previews.get(msg.id);
        this.previews.delete(msg.id);
        done?.(msg.count);
        break;
      }
      case 'alerts': {
        const fresh = this.emergencies.add(msg.items, now);
        if (fresh.length > 0) this.notifier.publish(fresh);
        break;
      }
      case 'error':
        break;
    }
  }

  private send(msg: ClientMessage): void {
    const s = this.socket;
    if (s?.readyState === OPEN) s.send(JSON.stringify(msg));
  }
}
