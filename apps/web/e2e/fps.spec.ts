import { expect, test } from '@playwright/test';
import { webglRenderer } from './webgl-renderer';

/**
 * CLAUDE.md budget: 16 ms per frame with 5 000 aircraft on screen.
 * The synthetic feed (`?synthetic=5000`) drives the real render path without
 * a server; the feed strip reports the p95 CPU frame time.
 */
test('renders 5000 aircraft within the 16 ms frame budget', async ({ page }) => {
  await page.goto('/?synthetic=5000&lat=50&lon=10&z=6');
  const inView = page.getByTestId('in-view');
  await expect(inView).toHaveText(/^[45][\s\u202f]?\d{3}$/, { timeout: 60_000 });

  // Let a few stats windows pass so JIT and texture upload settle.
  await page.waitForTimeout(5000);
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const text = (await page.getByTestId('frame-ms').textContent()) ?? '';
    samples.push(Number.parseFloat(text));
    await page.waitForTimeout(1100);
  }
  const worst = Math.max(...samples);
  test.info().annotations.push({ type: 'frame-ms-p95', description: samples.join(', ') });
  expect(worst).toBeLessThan(16);

  // Real frame rate as the browser delivers it.
  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (): void => {
          frames++;
          if (performance.now() - start < 2000) requestAnimationFrame(tick);
          else resolve((frames * 1000) / (performance.now() - start));
        };
        requestAnimationFrame(tick);
      }),
  );
  const renderer = await webglRenderer(page);
  test
    .info()
    .annotations.push({ type: 'fps', description: `${fps.toFixed(1)} on ${renderer.name}` });
  // Software rasterizers (SwiftShader on GPU-less CI) measure the emulator,
  // not the app; the CPU budget above is still enforced there.
  if (renderer.software) {
    test
      .info()
      .annotations.push({ type: 'skip-fps', description: 'software WebGL, fps not asserted' });
    return;
  }
  expect(fps).toBeGreaterThan(50);
});
