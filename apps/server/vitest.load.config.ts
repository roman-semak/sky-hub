import { defineConfig } from 'vitest/config';

/** Load/latency benchmarks, run serially after the rest of `pnpm check`. */
export default defineConfig({
  test: {
    include: ['test/**/*.bench.test.ts'],
    fileParallelism: false,
  },
});
