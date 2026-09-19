/**
 * Long-running memory soak test for the ingest server (Phase 1 DoD).
 *
 * Polls `/healthz` every `--interval` seconds for `--duration` minutes and
 * checks that `heapUsed` stays within ±10 % of its post-warm-up median.
 *
 *   pnpm --filter @skytrace/server dev &
 *   tsx scripts/soak.ts --duration 1440 --interval 60
 */
import { parseArgs } from 'node:util';
import { z } from 'zod';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:8080/healthz' },
    duration: { type: 'string', default: '15' },
    interval: { type: 'string', default: '30' },
    warmup: { type: 'string', default: '5' },
  },
});

const Health = z.object({
  aircraft: z.number(),
  peakAircraft: z.number(),
  memory: z.object({ heapUsedMb: z.number(), rssMb: z.number() }),
});

const durationMs = Number(values.duration) * 60_000;
const intervalMs = Number(values.interval) * 1000;
const warmupMs = Number(values.warmup) * 60_000;
const started = Date.now();
const heap: number[] = [];

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

while (Date.now() - started < durationMs) {
  try {
    const res = await fetch(values.url);
    const h = Health.parse(await res.json());
    const minute = ((Date.now() - started) / 60_000).toFixed(1);
    out(
      `${minute} min  aircraft=${h.aircraft} peak=${h.peakAircraft} heap=${h.memory.heapUsedMb}MB rss=${h.memory.rssMb}MB`,
    );
    if (Date.now() - started >= warmupMs) heap.push(h.memory.heapUsedMb);
  } catch (err) {
    out(`poll failed: ${String(err)}`);
  }
  await new Promise((r) => setTimeout(r, intervalMs));
}

if (heap.length < 2) {
  out('not enough samples after warm-up');
  process.exit(1);
}
const sorted = [...heap].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
const maxDev = Math.max(...heap.map((v) => Math.abs(v - median) / median));
// Compare the first and last thirds: a leak shows up as a steady climb.
const third = Math.max(1, Math.floor(heap.length / 3));
const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const drift = (avg(heap.slice(-third)) - avg(heap.slice(0, third))) / median;
out(
  `median heap ${median}MB, max deviation ${(maxDev * 100).toFixed(1)} %, drift ${(drift * 100).toFixed(1)} %`,
);
process.exit(Math.abs(drift) <= 0.1 ? 0 : 1);
