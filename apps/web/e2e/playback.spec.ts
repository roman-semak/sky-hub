import { expect, test } from '@playwright/test';
import { encodeAircraftFrame, FrameType, type AircraftRecord } from '@skytrace/protocol';
import { mockBackend } from './mock-backend';
import { webglRenderer } from './webgl-renderer';

const AIRCRAFT = 1500;
const SPACING_S = 20;
const HOUR_S = 3600;

/** One hour of recorded history over Portugal, in the `/api/history` wire format. */
function hourOfHistory(endMs: number): Buffer {
  const startS = Math.floor(endMs / 1000) - HOUR_S;
  const parts: Buffer[] = [];
  for (let s = 0; s <= HOUR_S; s += SPACING_S) {
    const records: AircraftRecord[] = [];
    for (let i = 0; i < AIRCRAFT; i++) {
      const heading = (i * 37) % 360;
      const rad = (heading * Math.PI) / 180;
      const dist = (s / HOUR_S) * 3; // degrees flown over the hour
      records.push({
        icao: 0x490000 + i,
        nonIcao: false,
        lat: 37 + (i % 40) * 0.1 + Math.cos(rad) * dist * 0.3,
        lon: -10 + Math.floor(i / 40) * 0.1 + Math.sin(rad) * dist * 0.3,
        alt: 5000 + ((i * 97) % 35000),
        gs: 420,
        track: heading,
        baroRate: 0,
        squawk: null,
        onGround: false,
        mlat: false,
        tisb: false,
        military: false,
        special: false,
        emergency: 'none',
        category: 'A3',
        age: 0,
      });
    }
    const frame = Buffer.from(encodeAircraftFrame(FrameType.Delta, startS + s, records));
    const len = Buffer.alloc(4);
    len.writeUInt32BE(frame.byteLength);
    parts.push(len, frame);
  }
  return Buffer.concat(parts);
}

/** Phase 5 DoD: an hour of history plays without freezes. */
test('plays an hour of history at ×60 without freezes', async ({ page }) => {
  test.setTimeout(120_000);
  await mockBackend(page);
  const payload = hourOfHistory(Date.now());
  await page.route('**/api/history?**', (route) =>
    route.fulfill({ body: payload, contentType: 'application/octet-stream' }),
  );
  await page.goto('/?lat=38.5&lon=-8.5&z=7');
  await page.getByTestId('open-playback').click();
  const bar = page.getByTestId('playback-bar');
  await expect(bar).toContainText(`${AIRCRAFT} aircraft`, { timeout: 30_000 });

  // Frame gaps and long tasks during 15 s of ×60 playback (15 minutes of history).
  await page.evaluate(() => {
    const w = window as unknown as { __gaps: number[]; __long: number[] };
    w.__gaps = [];
    w.__long = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    }).observe({ type: 'longtask', buffered: false });
    let last = performance.now();
    const tick = (): void => {
      const now = performance.now();
      w.__gaps.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await bar.getByRole('button', { name: '×60' }).click();
  const before = await page.getByTestId('playback-time').textContent();
  await page.getByTestId('playback-toggle').click();
  await page.waitForTimeout(15_000);

  // Scrubbing back rebuilds the registry from scratch; it must not freeze either.
  await bar.getByRole('slider', { name: 'Playback time' }).evaluate((el: HTMLInputElement) => {
    el.value = String(Number(el.min) + 10 * 60_000);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(2_000);

  const after = await page.getByTestId('playback-time').textContent();
  expect(after).not.toBe(before);
  const { gaps, long } = await page.evaluate(() => {
    const w = window as unknown as { __gaps: number[]; __long: number[] };
    return { gaps: w.__gaps.slice(5), long: w.__long };
  });
  const sorted = [...gaps].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Infinity;
  const worst = sorted.at(-1) ?? Infinity;
  const renderer = await webglRenderer(page);
  test.info().annotations.push({
    type: 'playback',
    description: `frames ${gaps.length}, p95 gap ${p95.toFixed(1)} ms, worst ${worst.toFixed(1)} ms, long tasks ${long.map((d) => d.toFixed(0)).join('/') || 'none'}, on ${renderer.name}`,
  });

  // Everything above — an hour loaded, playback advancing, a scrub that
  // rebuilds the registry — is asserted on every host. The frame timing below
  // is not: a software rasterizer presents frames an order of magnitude slower
  // than any GPU (p95 83 ms against 18 ms on one and the same machine), so on
  // GPU-less CI it would measure SwiftShader. The CPU-side budget is covered
  // there by fps.spec.ts, which holds 5 000 aircraft to 16 ms of frame work.
  if (renderer.software) {
    test
      .info()
      .annotations.push({ type: 'skip-frame-timing', description: 'software WebGL, not asserted' });
    return;
  }
  expect(p95).toBeLessThan(34);
  expect(worst).toBeLessThan(250);
  expect(Math.max(0, ...long)).toBeLessThan(250);
});
