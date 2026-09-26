/**
 * Writes the API origin into `<meta name="skytrace-api">` of a built bundle,
 * so the static site knows where the stateful API lives (ADR-010, ADR-013).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The build minifies `content=""` down to a bare `content` attribute.
const META = /(<meta\s+name="skytrace-api")(?:\s+content(?:="[^"]*")?)?(\s*\/?>)/g;

/**
 * Points every `index.html` under `distDir` — including per-locale
 * subdirectories — at `origin`. A blank origin is a no-op and leaves the
 * bundle on same-origin, which is what a container serving both does.
 * Returns the files it rewrote.
 */
export function setApiOrigin(distDir: string, origin: string): string[] {
  const clean = origin.trim().replace(/\/+$/, '');
  if (clean === '') return [];
  if (!/^https:\/\/[^\s"'<>]+$/.test(clean)) {
    throw new Error(`refusing a non-https API origin: ${clean}`);
  }

  const files = readdirSync(distDir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name === 'index.html')
    .map((entry) => join(entry.parentPath, entry.name));
  if (files.length === 0) {
    throw new Error(`no index.html under ${distDir}`);
  }

  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    const patched = html.replace(META, `$1 content="${clean}"$2`);
    if (patched === html) {
      throw new Error(`no <meta name="skytrace-api"> to patch in ${file}`);
    }
    writeFileSync(file, patched);
  }
  return files;
}
