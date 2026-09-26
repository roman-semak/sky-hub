import type { Page } from '@playwright/test';

/**
 * The page's WebGL renderer. GPU-less CI falls back to a software rasterizer
 * (SwiftShader), which throttles frame presentation by an order of magnitude:
 * the same playback measures p95 18 ms on a GPU and 83 ms on SwiftShader on
 * the very same machine. Timing tests use this to assert the app's own CPU
 * budget there instead of the browser's frame cadence.
 */
export async function webglRenderer(page: Page): Promise<{ name: string; software: boolean }> {
  const name = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  return { name, software: /swiftshader|llvmpipe|software/i.test(name) };
}
