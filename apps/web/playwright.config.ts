import { defineConfig, devices } from '@playwright/test';

const PORT = 4300;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  // FPS and playback tests measure frame timing; parallel workers would
  // compete for the CPU and make both them and their neighbours flaky.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    colorScheme: 'dark',
    // Hardware WebGL where the host has a GPU (macOS: Metal via ANGLE). On
    // GPU-less CI Chromium falls back to SwiftShader; see e2e/fps.spec.ts.
    launchOptions: { args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm exec ng serve --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
