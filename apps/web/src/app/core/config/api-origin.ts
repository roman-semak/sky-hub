/**
 * Origin of the API server, from `<meta name="skytrace-api" content="…">`.
 * Empty means same origin (dev proxy, or the server serving the build).
 * A static host such as Cloudflare Pages cannot proxy to another origin, so
 * the deploy pipeline writes the backend URL into this tag (ADR-010).
 */
export function apiOrigin(doc: Pick<Document, 'querySelector'> = document): string {
  const raw = doc.querySelector<HTMLMetaElement>('meta[name="skytrace-api"]')?.content.trim() ?? '';
  if (raw === '') return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
}

/** Absolute URL for an API path (`/api/…`); other URLs pass through unchanged. */
export function apiUrl(path: string, origin: string): string {
  return origin !== '' && path.startsWith('/api/') ? `${origin}${path}` : path;
}

/** WebSocket URL of `/stream` for the configured origin. */
export function streamUrl(origin: string, location: Pick<Location, 'protocol' | 'host'>): string {
  if (origin === '')
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/stream`;
  const u = new URL(origin);
  return `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}/stream`;
}
