import { describe, expect, it } from 'vitest';
import { trackExportUrl } from './track-export-url';

describe('trackExportUrl', () => {
  it('builds relative and absolute download URLs', () => {
    expect(trackExportUrl('4951ab', 'kml', '')).toBe('/api/track/4951ab?format=kml');
    expect(trackExportUrl('~abcdef', 'gpx', 'https://api.example.dev')).toBe(
      'https://api.example.dev/api/track/~abcdef?format=gpx',
    );
  });
});
