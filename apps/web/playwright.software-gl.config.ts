import base from './playwright.config';

/**
 * The GPU-less CI runner, reproduced locally: Chromium on SwiftShader instead
 * of the host's GPU. Frame-timing tests behave completely differently here
 * (ADR-014), and this config is how that gets checked before a push:
 *
 *   pnpm --filter @skytrace/web exec playwright test --config=playwright.software-gl.config.ts
 */
export default {
  ...base,
  use: { ...base.use, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader'] } },
};
