import { apiOrigin, apiUrl } from '../core/config/api-origin';

/** Download URL of a recorded track (SPEC phase 8 export). */
export function trackExportUrl(hex: string, format: 'kml' | 'gpx', origin = apiOrigin()): string {
  return apiUrl(`/api/track/${encodeURIComponent(hex)}?format=${format}`, origin);
}
