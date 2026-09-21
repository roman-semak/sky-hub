import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { encodeAircraftFrame, FrameType, type AircraftRecord } from '@skytrace/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCKET_FACTORY, STREAM_URL, StreamClient, type SocketLike } from './stream-client.service';

class FakeSocket implements SocketLike {
  static last: FakeSocket | null = null;
  static created = 0;
  binaryType: BinaryType = 'blob';
  readyState = 1;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent<ArrayBuffer | string>) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  readonly sent: string[] = [];
  closed = false;

  constructor() {
    FakeSocket.last = this;
    FakeSocket.created++;
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close'));
  }
  open(): void {
    this.onopen?.(new Event('open'));
  }
  receive(data: ArrayBuffer | string): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

const record: AircraftRecord = {
  icao: 0x4951ab,
  nonIcao: false,
  lat: 38.7,
  lon: -9.1,
  alt: 30_000,
  gs: 400,
  track: 90,
  baroRate: 0,
  squawk: '1000',
  onGround: false,
  mlat: false,
  tisb: false,
  military: false,
  special: false,
  emergency: 'none',
  category: 'A3',
  age: 0,
};

function setup(): StreamClient {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: SOCKET_FACTORY, useValue: () => new FakeSocket() },
      { provide: STREAM_URL, useValue: 'ws://test/stream' },
    ],
  });
  return TestBed.inject(StreamClient);
}

describe('StreamClient', () => {
  beforeEach(() => {
    FakeSocket.last = null;
    FakeSocket.created = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('connects, subscribes and decodes binary frames', () => {
    const client = setup();
    client.start();
    expect(client.connection()).toBe('connecting');
    const socket = FakeSocket.last;
    socket?.open();
    expect(client.connection()).toBe('live');

    client.subscribe([-11, 37, -8, 40], 9);
    expect(JSON.parse(socket?.sent[0] ?? '{}')).toEqual({
      t: 'sub',
      bbox: [-11, 37, -8, 40],
      zoom: 9,
    });

    socket?.receive(JSON.stringify({ t: 'hello', version: 1, serverTime: Date.now() }));
    socket?.receive(
      encodeAircraftFrame(FrameType.Snapshot, Math.floor(Date.now() / 1000), [record]),
    );
    expect(client.registry.aircraft.size).toBe(1);
    expect(client.lastFrameAt()).not.toBeNull();

    vi.advanceTimersByTime(1000);
    expect(client.aircraftCount()).toBe(1);
    expect(client.bytesPerSec()).toBeGreaterThan(0);
    client.stop();
  });

  it('answers pings and records latency', () => {
    const client = setup();
    client.start();
    const socket = FakeSocket.last;
    socket?.open();
    socket?.receive(JSON.stringify({ t: 'ping', ts: 1234 }));
    expect(JSON.parse(socket?.sent.at(-1) ?? '{}')).toEqual({ t: 'pong', ts: 1234 });
    socket?.receive(JSON.stringify({ t: 'stats', rttMs: 42, inView: 10 }));
    expect(client.rttMs()).toBe(42);
    client.stop();
  });

  it('survives malformed input', () => {
    const client = setup();
    client.start();
    const socket = FakeSocket.last;
    socket?.open();
    socket?.receive('{not json');
    socket?.receive(new ArrayBuffer(3));
    expect(client.registry.aircraft.size).toBe(0);
    expect(client.connection()).toBe('live');
    client.stop();
  });

  it('reconnects with backoff and restores subscription, filter and watches', () => {
    const client = setup();
    client.start();
    FakeSocket.last?.open();
    client.subscribe([-11, 37, -8, 40], 9);
    client.setFilter({ militaryOnly: true });
    client.watch('4951ab');
    client.unwatch('abcdef');

    FakeSocket.last?.close();
    expect(client.connection()).toBe('reconnecting');
    expect(FakeSocket.created).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(FakeSocket.created).toBe(2);
    const fresh = FakeSocket.last;
    fresh?.open();
    const messages = (fresh?.sent ?? []).map((m) => JSON.parse(m) as { t: string });
    expect(messages.map((m) => m.t)).toEqual(['sub', 'filter', 'watch']);
    client.stop();
  });

  it('runs a synthetic feed without a socket', () => {
    const client = setup();
    client.startSynthetic(25, 50, 10);
    expect(FakeSocket.created).toBe(0);
    expect(client.registry.aircraft.size).toBe(25);
    expect(client.connection()).toBe('live');
    vi.advanceTimersByTime(1000);
    expect(client.aircraftCount()).toBe(25);
    client.stop();
  });
});
