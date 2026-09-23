/**
 * Adds `<link rel="preconnect">` for the API origin when it is not our own.
 *
 * On a split deploy (static host + API elsewhere, ADR-010) the origin is only
 * known at runtime from the `<meta>` tag, so it cannot be a static link in
 * `index.html`. Connecting early saves the DNS + TLS round trips before the
 * first REST call and the WebSocket handshake.
 *
 * @returns the origins it added links for
 */
export function preconnectApi(origin: string, doc: Document = document): readonly string[] {
  if (origin === '' || origin === doc.location.origin) return [];
  const existing = doc.head.querySelector(`link[rel="preconnect"][href="${origin}"]`);
  if (existing !== null) return [];
  const link = doc.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  link.crossOrigin = '';
  doc.head.appendChild(link);
  return [origin];
}
