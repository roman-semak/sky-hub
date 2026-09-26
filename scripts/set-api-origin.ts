/**
 * Build step for the Vercel deploy (ADR-013): points the built bundle at the
 * API origin. Vercel serves only the static site; the API lives on Fly.io.
 *
 *   tsx scripts/set-api-origin.ts apps/web/dist/web/browser [origin]
 */
import { argv, env, stdout } from 'node:process';
import { setApiOrigin } from './lib/api-origin.js';

const [dir, originArg] = argv.slice(2);
if (dir === undefined) {
  throw new Error('usage: set-api-origin.ts <dist-dir> [origin]');
}

const written = setApiOrigin(dir, originArg ?? env['SKYTRACE_API_ORIGIN'] ?? '');
stdout.write(
  written.length === 0
    ? 'set-api-origin: no origin given, leaving the bundle on same-origin\n'
    : `set-api-origin: ${written.join(', ')}\n`,
);
