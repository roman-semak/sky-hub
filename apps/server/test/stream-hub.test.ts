import { decodeFrame, FrameType, type ServerMessage } from '@skytrace/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../src/logger.js';
import { StreamHub, type StreamSocket } from '../src/stream/stream-hub.js';
import { World } from './world.js';

class FakeSocket implements StreamSocket {
  bufferedAmount = 0;
  readyState = 1;
  readonly binary: ArrayBuffer[] = [];
  readonly text: ServerMessage[] = [];
  closed: { code: number | undefined; reason: string | undefined } | null = null;
  send(data: ArrayBuffer | string): void {
    if (typeof data === 'string') this.text.push(JSON.parse(data) as ServerMessage);
    else this.binary.push(data);
  }
  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
    this.readyState = 3;
  }
}

const sub = JSON.stringify({ t: 'sub', bbox: [-11, 37, -8, 40], zoom: 9 });

function setup() {
  const w = new World().put({ hex: '000001' });
  const demand: unknown[] = [];
  const hub = new StreamHub(
    silentLogger,
    (v) => demand.push(v),
    undefined,
    () => w.now,
  );
  return { w, hub, demand };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('StreamHub', () => {
  it('greets, subscribes, reports demand and streams frames', () => {
    const { w, hub, demand } = setup();
    const view = w.rebuild();
    hub.publish(view.index, []);
    const sock = new FakeSocket();
    const h = hub.connect(sock);
    expect(sock.text[0]).toMatchObject({ t: 'hello', version: 1 });
    h.onMessage(sub);
    expect(demand.at(-1)).toEqual([[-11, 37, -8, 40]]);
    // Subscribing flushes immediately with a snapshot.
    expect(decodeFrame(sock.binary[0]!).type).toBe(FrameType.Snapshot);
    w.now += 1000;
    w.put({ hex: '000001', lat: 38.9 });
    hub.publish(w.rebuild().index, []);
    expect(decodeFrame(sock.binary.at(-1)!).type).toBe(FrameType.Delta);
    expect(hub.statistics).toMatchObject({ clients: 1, framesSent: 2 });
    h.onClose();
    expect(hub.statistics.clients).toBe(0);
    expect(demand.at(-1)).toEqual([]);
  });

  it('does not count low-zoom viewports as demand', () => {
    const { hub, demand } = setup();
    const h = hub.connect(new FakeSocket());
    h.onMessage(JSON.stringify({ t: 'sub', bbox: [-180, -80, 180, 80], zoom: 2 }));
    expect(demand.at(-1)).toEqual([]);
  });

  it('skips ticks for slow consumers and catches up later', () => {
    const { w, hub } = setup();
    hub.publish(w.rebuild().index, []);
    const sock = new FakeSocket();
    const h = hub.connect(sock);
    h.onMessage(sub);
    sock.bufferedAmount = 10_000_000;
    w.now += 1000;
    w.put({ hex: '000001', lat: 38.9 });
    hub.publish(w.rebuild().index, []);
    expect(sock.binary).toHaveLength(1);
    expect(hub.statistics.skippedTicks).toBe(1);
    sock.bufferedAmount = 0;
    w.now += 1000;
    hub.publish(w.rebuild().index, []);
    const f = decodeFrame(sock.binary.at(-1)!);
    expect(f.type === FrameType.Delta && f.records).toHaveLength(1);
  });

  it('handles watch, unwatch, filter and pong', () => {
    const { w, hub } = setup();
    hub.publish(w.rebuild().index, []);
    const sock = new FakeSocket();
    const h = hub.connect(sock);
    h.onMessage(sub);
    h.onMessage(JSON.stringify({ t: 'filter', f: { militaryOnly: true } }));
    h.onMessage(JSON.stringify({ t: 'watch', hex: '000001' }));
    h.onMessage(JSON.stringify({ t: 'unwatch', hex: '000001' }));
    for (let i = 0; i < 10; i++) h.onMessage(JSON.stringify({ t: 'pong', ts: 0 }));
    expect(sock.text.filter((m) => m.t === 'error')).toHaveLength(0);
    w.now += 100_000;
    h.onMessage(JSON.stringify({ t: 'pong', ts: w.now - 42 }));
    for (let i = 0; i < 25; i++) {
      w.now += 200; // stay under the per-second message limit
      h.onMessage(JSON.stringify({ t: 'watch', hex: (0x100000 + i).toString(16) }));
    }
    expect(sock.text.some((m) => m.t === 'error' && m.message.includes('too many'))).toBe(true);
  });

  it('answers filter previews', () => {
    const { w, hub } = setup();
    hub.publish(w.rebuild().index, []);
    const sock = new FakeSocket();
    const h = hub.connect(sock);
    h.onMessage(JSON.stringify({ t: 'preview', f: {}, id: 7 }));
    expect(sock.text.at(-1)).toEqual({ t: 'preview', id: 7, count: 0 });
    h.onMessage(sub);
    h.onMessage(JSON.stringify({ t: 'preview', f: { militaryOnly: true }, id: 8 }));
    expect(sock.text.at(-1)).toEqual({ t: 'preview', id: 8, count: 0 });
    h.onMessage(JSON.stringify({ t: 'preview', f: {}, id: 9 }));
    expect(sock.text.at(-1)).toEqual({ t: 'preview', id: 9, count: 1 });
  });

  it('answers previews with zero before the first index', () => {
    const { hub } = setup();
    const sock = new FakeSocket();
    hub.connect(sock).onMessage(JSON.stringify({ t: 'preview', f: {}, id: 1 }));
    expect(sock.text.at(-1)).toEqual({ t: 'preview', id: 1, count: 0 });
  });

  it('rejects invalid messages and disconnects floods', () => {
    const { hub } = setup();
    const sock = new FakeSocket();
    const h = hub.connect(sock);
    h.onMessage('{nope');
    h.onMessage(JSON.stringify({ t: 'launch' }));
    expect(sock.text.flatMap((m) => (m.t === 'error' ? [m.message] : []))).toEqual([
      'invalid JSON',
      'invalid message',
    ]);
    for (let i = 0; i < 30; i++) h.onMessage(JSON.stringify({ t: 'pong', ts: 1 }));
    expect(sock.closed).toEqual({ code: 1008, reason: 'rate limit exceeded' });
  });

  it('pings clients with stats and closes everything on stop', async () => {
    vi.useFakeTimers();
    const { hub } = setup();
    const sock = new FakeSocket();
    hub.connect(sock);
    hub.start();
    hub.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sock.text.map((m) => m.t)).toEqual(['hello', 'ping', 'stats']);
    hub.stop();
    hub.stop();
    expect(sock.closed?.code).toBe(1001);
  });

  it('ignores closed sockets and swallows send errors', () => {
    const { w, hub } = setup();
    hub.publish(w.rebuild().index, []);
    const sock = new FakeSocket();
    const h = hub.connect(sock);
    h.onMessage(sub);
    sock.readyState = 3;
    w.now += 5000;
    hub.publish(w.rebuild().index, []);
    expect(sock.binary).toHaveLength(1);
    const broken = new FakeSocket();
    broken.send = () => {
      throw new Error('EPIPE');
    };
    expect(() => hub.connect(broken)).not.toThrow();
  });
});
