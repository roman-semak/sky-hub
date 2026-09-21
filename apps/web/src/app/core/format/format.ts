/** Altitude as a flight level above the transition altitude, feet below it. */
export function formatAltitude(altFt: number | null, onGround: boolean): string {
  if (onGround) return $localize`:@@fmt.ground:ground`;
  if (altFt === null) return '—';
  if (altFt >= 18_000) return `FL${Math.round(altFt / 100)}`;
  return `${Math.round(altFt / 25) * 25} ft`;
}

export function formatSpeed(gs: number | null): string {
  return gs === null ? '—' : `${Math.round(gs)} kt`;
}

export function formatVerticalRate(fpm: number | null): string {
  if (fpm === null) return '—';
  const r = Math.round(fpm / 8) * 8;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)} fpm`;
}

export function formatTrack(deg: number | null): string {
  return deg === null ? '—' : `${Math.round(deg)}°`;
}

export function formatCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)} ${ns} · ${Math.abs(lon).toFixed(2)} ${ew}`;
}

/** Thin-space grouped integer, matching the design's tabular readouts. */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US').replace(/,/g, ' ');
}

export function formatBytesPerSec(bytes: number): string {
  return bytes < 1024 ? `${bytes} B/s` : `${(bytes / 1024).toFixed(1)} KB/s`;
}

export function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}
